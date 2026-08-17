import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { think } from '../core/brain.js';
import { authenticate } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { LlmError } from '../llm/index.js';

const ChatBody = z.object({
  session_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_:.-]+$/, 'session_id solo admite [a-zA-Z0-9_:.-]'),
  message: z.string().min(1).max(config.MAX_MESSAGE_CHARS),
  display_name: z.string().max(120).optional(),
  override_variables: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

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

    // El límite va antes de la llamada al modelo. Después no ahorra nada.
    const limit = checkRateLimit(`chat:${client.clientId}`, config.RATE_LIMIT_PER_MINUTE);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(limit.retryAfterSeconds))
        .send({ error: 'rate_limited', retry_after: limit.retryAfterSeconds });
    }

    const parsed = ChatBody.safeParse(request.body);
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

    try {
      const result = await think({
        clientId: client.clientId,
        channel: 'web',
        channelUserId: body.session_id,
        threadRef: body.session_id,
        message: body.message,
        displayName: body.display_name,
        overrideVariables: body.override_variables,
      });

      if (result.handedOff) {
        return reply.send({
          status: 'handoff',
          data: {
            reply: null,
            session_id: body.session_id,
            message: 'Esta conversación la está atendiendo una persona.',
          },
        });
      }

      return reply.send({
        status: 'success',
        data: {
          reply: result.reply,
          session_id: body.session_id,
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
