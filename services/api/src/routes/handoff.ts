/**
 * Endpoints de handoff y de disparadores proactivos.
 *
 * Los llama el sistema del cliente (su CRM, su panel de agentes), no el usuario
 * final: van con la misma clave de API que el chat, pero exigen un permiso
 * distinto. Quien integra un widget de chat en su web reparte esa clave por el
 * navegador; ese mismo token no puede poder reactivar conversaciones ni
 * programar mensajes a terceros.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { queryOne } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { config } from '../config.js';
import { buildHandoffResolvedPrompt } from '../core/proactive.js';
import { scheduleProactiveMessage } from '../queue/proactive.js';

const SESSION_ID = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_:.-]+$/, 'session_id solo admite [a-zA-Z0-9_:.-]');

const CHANNEL = z.enum([
  'web', 'whatsapp', 'sms', 'voice', 'email', 'telegram',
  'instagram', 'messenger', 'youtube', 'tiktok', 'linkedin', 'x',
]);

const ResolveBody = z.object({
  session_id: SESSION_ID,
  channel: CHANNEL.default('web'),
  /** Lo que deja escrito el agente humano. Se le pasa al modelo como contexto. */
  note: z.string().max(2000).optional(),
  /**
   * Por defecto el bot escribe un mensaje de cierre. Con `false` solo se
   * reabre la conversación y el bot espera a que hablen primero — que es lo
   * que se quiere cuando el humano ya se despidió.
   */
  send_closing_message: z.boolean().default(true),
});

const ProactiveBody = z.object({
  session_id: SESSION_ID,
  channel: CHANNEL.default('web'),
  context_prompt: z.string().min(1).max(2000),
  /** ISO 8601. Ausente = cuanto antes. */
  send_at: z.string().datetime().optional(),
  /** Clave de idempotencia: con la misma, el duplicado se descarta. */
  dedupe_key: z.string().max(128).optional(),
});

export async function handoffRoutes(app: FastifyInstance) {
  /**
   * Devuelve la conversación al bot después de que un humano la haya atendido.
   *
   * Dos cosas separadas que conviene no confundir: **reabrir** (el bot vuelve a
   * responder cuando escriban) y **escribir el cierre** (el bot manda un mensaje
   * ahora). La primera es síncrona y pasa siempre; la segunda se encola.
   */
  app.post('/api/v1/handoff/resolve', async (request, reply) => {
    const client = await authenticate(request.headers.authorization);
    if (!client) return reply.code(401).send({ error: 'unauthorized' });

    if (!client.scopes.includes('handoff')) {
      return reply.code(403).send({
        error: 'la clave no tiene el permiso "handoff"',
        hint: 'Emítela con: npm run admin -- issue-key <slug> --scopes chat,handoff',
      });
    }

    const limit = checkRateLimit(`handoff:${client.clientId}`, config.RATE_LIMIT_PER_MINUTE);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(limit.retryAfterSeconds))
        .send({ error: 'rate_limited', retry_after: limit.retryAfterSeconds });
    }

    const parsed = ResolveBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    const body = parsed.data;

    // La conversación se busca acotada al cliente de la clave. Sin ese filtro,
    // cualquier cliente podría reactivar la conversación de otro sabiendo su
    // session_id.
    const conversation = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM conversations
        WHERE client_id = $1 AND thread_ref = $2 AND channel = $3::channel_kind`,
      [client.clientId, body.session_id, body.channel],
    );

    if (!conversation) {
      return reply.code(404).send({ error: 'conversation_not_found' });
    }

    // Idempotente a propósito: un panel de agentes puede mandar "resuelto" dos
    // veces con dos clics. Reabrir lo ya abierto no debe ser un error, pero
    // tampoco debe encolar un segundo mensaje de cierre.
    const yaAbierta = conversation.status !== 'handoff';

    await queryOne(
      `UPDATE conversations
          SET status = 'open', handoff_reason = NULL, handoff_at = NULL
        WHERE id = $1
      RETURNING id`,
      [conversation.id],
    );

    if (yaAbierta || !body.send_closing_message) {
      return reply.send({
        status: 'success',
        data: {
          session_id: body.session_id,
          reopened: true,
          closing_message_queued: false,
          reason: yaAbierta ? 'la conversación no estaba derivada' : 'no se pidió mensaje de cierre',
        },
      });
    }

    const scheduled = await scheduleProactiveMessage({
      clientId: client.clientId,
      sessionId: body.session_id,
      channel: body.channel,
      contextPrompt: buildHandoffResolvedPrompt(body.note),
      kind: 'handoff_resolved',
      // Idempotencia por conversación: dos clics en "resuelto" no mandan dos
      // mensajes de cierre.
      dedupeKey: `handoff-resolved:${conversation.id}`,
    });

    return reply.send({
      status: 'success',
      data: {
        session_id: body.session_id,
        reopened: true,
        closing_message_queued: scheduled.queueJobId !== null,
        job_id: scheduled.jobRecordId,
      },
    });
  });

  /**
   * Programa un mensaje proactivo.
   *
   * `context_prompt` es una instrucción para el modelo, no el texto que se
   * envía: "avisa al usuario de que su cita es mañana a las 10:00". El mensaje
   * lo redacta el bot con su voz y en el idioma en que venía hablando esa
   * persona.
   */
  app.post('/api/v1/proactive', async (request, reply) => {
    const client = await authenticate(request.headers.authorization);
    if (!client) return reply.code(401).send({ error: 'unauthorized' });

    if (!client.scopes.includes('proactive')) {
      return reply.code(403).send({
        error: 'la clave no tiene el permiso "proactive"',
        hint: 'Emítela con: npm run admin -- issue-key <slug> --scopes chat,proactive',
      });
    }

    const limit = checkRateLimit(`proactive:${client.clientId}`, config.RATE_LIMIT_PER_MINUTE);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(limit.retryAfterSeconds))
        .send({ error: 'rate_limited', retry_after: limit.retryAfterSeconds });
    }

    const parsed = ProactiveBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    const body = parsed.data;

    const sendAt = body.send_at ? new Date(body.send_at) : undefined;
    if (sendAt && sendAt.getTime() > Date.now() + config.PROACTIVE_MAX_DELAY_MS) {
      return reply.code(400).send({
        error: 'send_at_too_far',
        message: `No se admiten programaciones a más de ${
          config.PROACTIVE_MAX_DELAY_MS / 86_400_000
        } días.`,
      });
    }

    const scheduled = await scheduleProactiveMessage({
      clientId: client.clientId,
      sessionId: body.session_id,
      channel: body.channel,
      contextPrompt: body.context_prompt,
      ...(sendAt && { sendAt }),
      ...(body.dedupe_key && { dedupeKey: `${client.clientId}:${body.dedupe_key}` }),
    });

    return reply.code(202).send({
      status: 'queued',
      data: {
        job_id: scheduled.jobRecordId,
        scheduled_for: scheduled.scheduledFor?.toISOString() ?? null,
        // Null cuando no hay Redis: la petición se aceptó y quedó constancia,
        // pero no se va a enviar. Quien integra necesita saberlo.
        queue_job_id: scheduled.queueJobId,
      },
    });
  });
}
