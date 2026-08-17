import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { think } from '../core/brain.js';
import { authenticate } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { LlmError } from '../llm/index.js';
import { ingest } from '../media/ingest.js';
import { MediaError, type MediaInput } from '../media/types.js';
import { formatForChannel, type ChannelType } from '../channels/outputFormatter.js';

const ChatBody = z.object({
  session_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_:.-]+$/, 'session_id solo admite [a-zA-Z0-9_:.-]'),
  message: z.string().min(1).max(config.MAX_MESSAGE_CHARS),
  display_name: z.string().max(120).optional(),
  override_variables: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  /**
   * Dónde se va a pintar la respuesta. No cambia la conversación —el canal
   * sigue siendo 'web'—, solo el formato de salida: quien integra este endpoint
   * en una pasarela de WhatsApp o de SMS necesita texto adaptado, no Markdown.
   */
  channel_type: z.enum(['web', 'whatsapp', 'telegram', 'sms', 'voice']).default('web'),
});

/**
 * En multipart el mensaje es opcional: una nota de voz sin texto es una
 * petición perfectamente válida. Lo que no vale es venir sin nada, y eso se
 * comprueba después de leer las partes.
 */
const MultipartFields = ChatBody.extend({
  message: z.string().max(config.MAX_MESSAGE_CHARS).optional(),
  override_variables: z.string().optional(),
  // En multipart todo llega como cadena, así que el valor por defecto se
  // aplica cuando el campo no viene.
  channel_type: z.enum(['web', 'whatsapp', 'telegram', 'sms', 'voice']).default('web'),
});

interface ParsedRequest {
  sessionId: string;
  message: string;
  displayName?: string;
  overrideVariables: Record<string, unknown>;
  media: MediaInput[];
  channelType: ChannelType;
}

export async function chatRoutes(app: FastifyInstance) {
  app.post('/api/v1/chat', async (request, reply) => {
    const client = await authenticate(request.headers.authorization);
    if (!client) {
      // Mismo 401 para clave inválida, revocada y cliente inactivo.
      return reply.code(401).send({ error: 'unauthorized' });
    }

    if (!client.scopes.includes('chat')) {
      return reply.code(403).send({ error: 'la clave no tiene el permiso "chat"' });
    }

    // El límite va antes de leer el cuerpo y antes de llamar al modelo. Después
    // no ahorra nada, y con multipart importa más: un adjunto de 10 MB consume
    // memoria y ancho de banda antes de que se decida si el cliente puede.
    const limit = checkRateLimit(`chat:${client.clientId}`, config.RATE_LIMIT_PER_MINUTE);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(limit.retryAfterSeconds))
        .send({ error: 'rate_limited', retry_after: limit.retryAfterSeconds });
    }

    let parsed: ParsedRequest;
    try {
      parsed = request.isMultipart() ? await parseMultipart(request) : parseJson(request);
    } catch (err) {
      if (err instanceof MediaError) {
        return reply.code(400).send({ error: 'invalid_media', message: err.userMessage });
      }
      if (err instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'invalid_request',
          details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        });
      }
      // @fastify/multipart lanza esto al pasarse del límite de tamaño. Es un 413,
      // no un 500: el cliente puede corregirlo mandando algo más pequeño.
      if (err instanceof Error && err.message.includes('request file too large')) {
        return reply.code(413).send({
          error: 'file_too_large',
          message: `El archivo supera el límite de ${config.MEDIA_MAX_BYTES} bytes.`,
        });
      }
      request.log.error({ err }, 'no se pudo leer la petición');
      return reply.code(400).send({ error: 'invalid_request' });
    }

    // ── Multimodal: todo a texto antes de entrar al núcleo ────────

    let ingested;
    try {
      ingested = await ingest({ text: parsed.message, media: parsed.media });
    } catch (err) {
      if (err instanceof MediaError) {
        return reply.code(400).send({ error: 'invalid_media', message: err.userMessage });
      }
      throw err;
    }

    if (!ingested.message.trim()) {
      // Ni texto ni nada aprovechable de los adjuntos. Si algún adjunto falló,
      // se le dice por qué en vez de un error genérico.
      const detalle = ingested.failures[0]?.userMessage;
      return reply.code(400).send({
        error: 'empty_message',
        message: detalle ?? 'La petición no traía ni texto ni un archivo que pueda procesar.',
      });
    }

    try {
      const result = await think({
        clientId: client.clientId,
        channel: 'web',
        channelUserId: parsed.sessionId,
        threadRef: parsed.sessionId,
        message: ingested.message,
        displayName: parsed.displayName,
        overrideVariables: parsed.overrideVariables,
        sourceKind: ingested.sourceKind,
        mediaCostMicros: ingested.mediaCostMicros,
      });

      if (result.handedOff) {
        return reply.send({
          status: 'handoff',
          data: {
            reply: null,
            session_id: parsed.sessionId,
            message: 'Esta conversación la está atendiendo una persona.',
          },
        });
      }

      return reply.send({
        status: result.stopReason === 'handoff' ? 'handoff_requested' : 'success',
        data: {
          // Última parada antes de salir: el Markdown del modelo se adapta al
          // canal donde se va a pintar. Se hace aquí y no en un hook `onSend`
          // porque un hook recibe el cuerpo ya serializado y tendría que
          // parsear el JSON, reescribir un campo y volver a serializarlo —
          // trabajo extra en cada respuesta para no saber siquiera qué canal es.
          reply: formatForChannel(result.reply, parsed.channelType),
          session_id: parsed.sessionId,
          model: result.model,
          usage: {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          },
          latency_ms: result.latencyMs,
          // Qué herramientas se ejecutaron en este turno. El cliente es quien
          // las configuró, así que no revela nada que no sea suyo, y ahorra
          // muchas preguntas de "¿por qué ha tardado tanto?".
          tools_used: result.toolsUsed,
          iterations: result.steps.length,
          stop_reason: result.stopReason,
          // Qué se procesó del adjunto, para que el cliente pueda enseñar
          // "te he entendido esto" y corregir una transcripción mala.
          ...(ingested.extractions.length > 0 && {
            media: ingested.extractions.map((e) => ({ kind: e.kind, text: e.text })),
          }),
          ...(ingested.failures.length > 0 && { media_errors: ingested.failures }),
        },
      });
    } catch (err) {
      if (err instanceof LlmError) {
        request.log.error({ err: err.message, status: err.status }, 'fallo del proveedor de modelo');
        return reply.code(502).send({ error: 'model_provider_error' });
      }
      if (err instanceof Error && err.name === 'TimeoutError') {
        request.log.error('timeout del proveedor de modelo');
        return reply.code(504).send({ error: 'model_timeout' });
      }
      request.log.error({ err }, 'error no controlado en /chat');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
}

function parseJson(request: FastifyRequest): ParsedRequest {
  const body = ChatBody.parse(request.body);
  return {
    sessionId: body.session_id,
    message: body.message,
    displayName: body.display_name,
    overrideVariables: body.override_variables,
    media: [],
    channelType: body.channel_type,
  };
}

/**
 * Lee `multipart/form-data`.
 *
 * Los ficheros se materializan en memoria a propósito: los límites de
 * `@fastify/multipart` (ver `index.ts`) acotan el tamaño y el número, y el
 * destino inmediato es una petición HTTP a OpenAI. Escribirlos a disco solo
 * añadiría un fichero temporal que limpiar y una vía de escritura arbitraria.
 *
 * Se recorre en streaming: leer todas las partes en un array primero anularía
 * el límite de tamaño, porque para entonces ya estarían todas en memoria.
 */
async function parseMultipart(request: FastifyRequest): Promise<ParsedRequest> {
  const fields: Record<string, string> = {};
  const media: MediaInput[] = [];

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (media.length >= config.MEDIA_MAX_ATTACHMENTS) {
        // Hay que drenar la parte aunque se descarte: dejarla sin consumir
        // bloquea el iterador y la petición se queda colgada.
        await part.toBuffer();
        throw new MediaError(
          `Más de ${config.MEDIA_MAX_ATTACHMENTS} adjuntos.`,
          `Puedo con ${config.MEDIA_MAX_ATTACHMENTS} archivos a la vez como mucho.`,
        );
      }

      const buffer = await part.toBuffer();
      media.push({
        // Pista, no garantía: `ingest` decide por los bytes reales.
        kind: part.mimetype.startsWith('image/') ? 'image' : 'audio',
        buffer,
        mime: part.mimetype,
        filename: part.filename,
      });
      continue;
    }

    // Los campos de texto se guardan por nombre. Un valor repetido se queda con
    // el último, que es lo que hace cualquier parser de formularios.
    fields[part.fieldname] = String(part.value);
  }

  const parsedFields = MultipartFields.parse({
    session_id: fields.session_id,
    message: fields.message,
    display_name: fields.display_name,
    override_variables: fields.override_variables,
    ...(fields.channel_type && { channel_type: fields.channel_type }),
  });

  let overrideVariables: Record<string, unknown> = {};
  if (parsedFields.override_variables) {
    try {
      const raw = JSON.parse(parsedFields.override_variables);
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        overrideVariables = raw as Record<string, unknown>;
      }
    } catch {
      throw new MediaError(
        'override_variables no era JSON válido.',
        'El campo override_variables debe ser un objeto JSON.',
      );
    }
  }

  return {
    sessionId: parsedFields.session_id,
    message: parsedFields.message ?? '',
    displayName: parsedFields.display_name,
    overrideVariables,
    media,
    channelType: parsedFields.channel_type,
  };
}
