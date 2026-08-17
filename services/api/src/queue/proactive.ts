/**
 * Cola de mensajes proactivos.
 *
 * El bot deja de ser solo reactivo: puede recordar una cita mañana, retomar una
 * conversación tras la intervención de un humano, o avisar de algo que cambió.
 */
import { Queue, type JobsOptions } from 'bullmq';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { getRedis, isQueueEnabled } from './connection.js';

export const PROACTIVE_QUEUE = 'pita:proactive';

export type ProactiveJobKind = 'proactive_message' | 'handoff_resolved';

export interface ProactiveJobData {
  kind: ProactiveJobKind;
  clientId: string;
  /** `thread_ref` de la conversación: lo que el canal llama sesión. */
  sessionId: string;
  channel: string;
  /**
   * Qué debe decir el bot, en lenguaje natural.
   * Ej.: "Avisa al usuario de que su cita es mañana a las 10:00".
   *
   * Es una instrucción para el modelo, no el texto literal que se envía: el
   * mensaje final lo redacta el modelo con la voz del cliente y el contexto de
   * la conversación. Mandar texto literal se saltaría la personalidad del bot
   * y el idioma en el que venía hablando esa persona.
   */
  contextPrompt: string;
  /** Fila de `proactive_jobs`, para cerrar el círculo al terminar. */
  jobRecordId: string;
}

let queue: Queue<ProactiveJobData> | null = null;

export function getProactiveQueue(): Queue<ProactiveJobData> {
  queue ??= new Queue<ProactiveJobData>(PROACTIVE_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: config.PROACTIVE_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 30_000 },
      // Los trabajos terminados se limpian solos: sin esto, Redis acumula el
      // histórico completo y acaba siendo el cuello de botella de memoria. El
      // registro duradero está en `proactive_jobs`, en Postgres.
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
  return queue;
}

export interface ScheduleProactiveParams {
  clientId: string;
  sessionId: string;
  channel: string;
  contextPrompt: string;
  kind?: ProactiveJobKind;
  /** Cuándo enviarlo. Ausente = cuanto antes. */
  sendAt?: Date;
  /**
   * Clave de idempotencia. Con la misma clave, BullMQ descarta el duplicado.
   * Imprescindible cuando quien encola es un webhook de terceros, que reintenta.
   */
  dedupeKey?: string;
}

export interface ScheduleResult {
  jobRecordId: string;
  queueJobId: string | null;
  scheduledFor: Date | null;
}

/**
 * Programa un mensaje proactivo.
 *
 * Escribe primero en Postgres y encola después. El orden importa: si se cae
 * entre medias, queda una fila en `queued` que nunca se procesa —visible y
 * reparable— en vez de un trabajo en Redis del que no hay rastro en la base de
 * datos. Un aviso que no se manda y se ve es mejor que uno que se manda y no
 * consta.
 */
export async function scheduleProactiveMessage(
  params: ScheduleProactiveParams,
): Promise<ScheduleResult> {
  const kind = params.kind ?? 'proactive_message';
  const scheduledFor = params.sendAt ?? null;

  const conversation = await queryOne<{ id: string }>(
    `SELECT id FROM conversations
      WHERE client_id = $1 AND thread_ref = $2 AND channel = $3::channel_kind`,
    [params.clientId, params.sessionId, params.channel],
  );

  const record = await queryOne<{ id: string }>(
    `INSERT INTO proactive_jobs
       (client_id, conversation_id, kind, context_prompt, scheduled_for)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [params.clientId, conversation?.id ?? null, kind, params.contextPrompt, scheduledFor],
  );
  const jobRecordId = record!.id;

  if (!isQueueEnabled()) {
    // Sin Redis queda constancia de la intención, marcada como saltada. Es
    // mejor que fallar: quien encoló se entera de que su petición se recibió y
    // por qué no salió.
    await query(
      `UPDATE proactive_jobs
          SET status = 'skipped', skip_reason = 'REDIS_URL no configurada', processed_at = NOW()
        WHERE id = $1`,
      [jobRecordId],
    );
    return { jobRecordId, queueJobId: null, scheduledFor };
  }

  const delay = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;

  const options: JobsOptions = { delay };
  if (params.dedupeKey) options.jobId = params.dedupeKey;

  const job = await getProactiveQueue().add(
    kind,
    {
      kind,
      clientId: params.clientId,
      sessionId: params.sessionId,
      channel: params.channel,
      contextPrompt: params.contextPrompt,
      jobRecordId,
    },
    options,
  );

  await query(`UPDATE proactive_jobs SET queue_job_id = $2 WHERE id = $1`, [
    jobRecordId,
    job.id ?? null,
  ]);

  return { jobRecordId, queueJobId: job.id ?? null, scheduledFor };
}

/** Cancela un trabajo aún no ejecutado. */
export async function cancelProactiveJob(jobRecordId: string): Promise<boolean> {
  const row = await queryOne<{ queue_job_id: string | null; status: string }>(
    `SELECT queue_job_id, status FROM proactive_jobs WHERE id = $1`,
    [jobRecordId],
  );
  if (!row || row.status !== 'queued') return false;

  if (row.queue_job_id && isQueueEnabled()) {
    const job = await getProactiveQueue().getJob(row.queue_job_id);
    // `remove()` falla si el trabajo ya está en marcha: entonces no hay nada
    // que cancelar y la comprobación del worker es la que decide.
    await job?.remove().catch(() => undefined);
  }

  await query(
    `UPDATE proactive_jobs
        SET status = 'skipped', skip_reason = 'cancelado', processed_at = NOW()
      WHERE id = $1`,
    [jobRecordId],
  );
  return true;
}

export async function closeProactiveQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
