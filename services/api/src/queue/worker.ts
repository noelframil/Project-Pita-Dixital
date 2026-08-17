/**
 * Worker de mensajes proactivos.
 *
 * Consume la cola, redacta el mensaje con el modelo del cliente y lo envía por
 * su canal. Corre en el mismo proceso que la API por sencillez; sacarlo a un
 * proceso aparte es cambiar dos líneas en `index.ts` y no tocar nada de aquí.
 */
import { Worker, type Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { query } from '../db.js';
import { sendToConversation } from '../channels/outbound.js';
import { composeProactiveMessage } from '../core/proactive.js';
import type { ChannelKind } from '../core/conversations.js';
import { getRedis, isQueueEnabled } from './connection.js';
import { PROACTIVE_QUEUE, type ProactiveJobData } from './proactive.js';

async function markSkipped(jobRecordId: string, reason: string): Promise<void> {
  await query(
    `UPDATE proactive_jobs
        SET status = 'skipped', skip_reason = $2, processed_at = NOW()
      WHERE id = $1`,
    [jobRecordId, reason],
  );
}

async function markSent(jobRecordId: string, messageId: string | undefined): Promise<void> {
  await query(
    `UPDATE proactive_jobs
        SET status = 'sent', message_id = $2, processed_at = NOW()
      WHERE id = $1`,
    [jobRecordId, messageId ?? null],
  );
}

async function markFailed(jobRecordId: string, error: string): Promise<void> {
  await query(
    `UPDATE proactive_jobs
        SET status = 'failed', last_error = $2, processed_at = NOW()
      WHERE id = $1`,
    [jobRecordId, error.slice(0, 500)],
  );
}

/**
 * Procesa un trabajo.
 *
 * Distingue dos clases de resultado que no se pueden mezclar:
 *
 * · **Saltado**: la comprobación previa dijo que no tocaba enviar (conversación
 *   derivada a un humano, ventana de 24 h cerrada, demasiado pronto). Es un
 *   resultado normal. Se marca y se termina **sin lanzar**: si lanzara, BullMQ
 *   reintentaría seis veces algo que va a dar el mismo resultado siempre.
 *
 * · **Fallido**: algo se rompió (proveedor caído, canal sin adaptador). Se
 *   lanza para que BullMQ reintente con backoff.
 */
async function processJob(job: Job<ProactiveJobData>, log: FastifyBaseLogger): Promise<void> {
  const { clientId, sessionId, channel, contextPrompt, jobRecordId } = job.data;

  const outcome = await composeProactiveMessage({
    clientId,
    sessionId,
    channel: channel as ChannelKind,
    contextPrompt,
  });

  if (!outcome.sent) {
    await markSkipped(jobRecordId, outcome.skipReason ?? 'desconocido');
    log.info(
      { jobId: job.id, jobRecordId, reason: outcome.skipReason },
      'mensaje proactivo saltado',
    );
    return;
  }

  // El mensaje ya está registrado en `messages`. Si el envío falla, el
  // reintento lo detectará por el freno anti-spam y saltará, así que no se
  // duplica: se pierde un aviso, que es preferible a mandarlo dos veces.
  await sendToConversation(outcome.conversationId!, outcome.text!);
  await markSent(jobRecordId, outcome.messageId);

  log.info(
    { jobId: job.id, jobRecordId, conversationId: outcome.conversationId },
    'mensaje proactivo enviado',
  );
}

export function startProactiveWorker(log: FastifyBaseLogger): (() => Promise<void>) | null {
  if (!isQueueEnabled()) {
    log.info(
      'REDIS_URL no configurada: la capa de mensajes proactivos queda apagada. ' +
        'El resto del servicio funciona igual.',
    );
    return null;
  }

  const worker = new Worker<ProactiveJobData>(
    PROACTIVE_QUEUE,
    async (job) => processJob(job, log),
    {
      connection: getRedis(),
      concurrency: config.PROACTIVE_CONCURRENCY,
      // Los proactivos no corren prisa y cada uno gasta una llamada al modelo.
      // Limitar el ritmo evita que una tanda de mil recordatorios agote el
      // rate limit del proveedor y deje sin servicio a las conversaciones en
      // vivo, que sí tienen a alguien esperando al otro lado.
      limiter: { max: config.PROACTIVE_RATE_MAX, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'trabajo proactivo fallido');

    // Solo se marca como fallida la fila cuando se agotaron los reintentos:
    // marcarla en el primer fallo daría por muerto algo que aún va a reintentar.
    const agotado = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    if (agotado && job.data.jobRecordId) {
      void markFailed(job.data.jobRecordId, err.message);
    }
  });

  worker.on('error', (err) => {
    log.error({ err: err.message }, 'error del worker proactivo');
  });

  log.info({ concurrency: config.PROACTIVE_CONCURRENCY }, 'worker de mensajes proactivos iniciado');

  return async () => {
    await worker.close();
  };
}
