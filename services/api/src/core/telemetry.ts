/**
 * Telemetría del agente (LLMOps).
 *
 * Registra cada paso del razonamiento en `agent_traces`. Entre el mensaje del
 * usuario y la respuesta del bot puede haber cinco vueltas y varias llamadas a
 * herramientas que `messages` no deja ver; cuando un cliente pregunta "¿por qué
 * contestó esto?" o "¿por qué tardó doce segundos?", la respuesta está aquí.
 *
 * ── Dos reglas que no se negocian ──────────────────────────────
 *
 * **1. Nunca bloquea el bucle.** Las escrituras se disparan sin esperar
 * (fire-and-forget). Un agente que hace cinco vueltas haría cinco esperas a
 * Postgres antes de contestar, y eso es latencia que paga el usuario para que
 * nosotros tengamos datos.
 *
 * **2. Nunca rompe el turno.** Si el INSERT falla, se grita por stdout y ya. La
 * auditoría es un observador: un observador que tira el sistema que observa
 * está mal construido. Esto es la misma decisión que ya se tomó en
 * `recordInvocation`, por el mismo motivo.
 *
 * ── El precio de esas dos reglas ───────────────────────────────
 *
 * Fire-and-forget significa que las trazas pueden perderse si el proceso muere
 * entre el disparo y el commit, y que pueden llegar desordenadas. Por eso cada
 * fila lleva `iteration` y `step_type`: el orden se reconstruye al leer, no se
 * confía en el de inserción. `flush()` existe para los casos donde sí importa
 * esperar — apagado ordenado, o pruebas.
 */
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';

export type AgentStepType = 'thought' | 'tool_call' | 'tool_result' | 'error';

/**
 * Quién dio el paso. Con varios agentes trabajando en un mismo turno, la traza
 * deja de responder a "¿por qué contestó esto?" si no dice quién hizo cada cosa.
 */
export type AgentRole = 'orchestrator' | 'specialist' | 'critic';

export interface TraceEntry {
  conversationId: string;
  runId: string;
  iteration: number;
  stepType: AgentStepType;
  toolName?: string | null;
  payload?: Record<string, unknown>;
  latencyMs?: number | null;
  tokensUsed?: number | null;
  agentRole?: AgentRole;
  /** Nombre del especialista. Ausente en el orquestador. */
  agentName?: string | null;
  /** Turno del orquestador que originó este bucle anidado. */
  parentRunId?: string | null;
}

/**
 * Escrituras en vuelo. Se guardan para que `flush()` pueda esperarlas al apagar
 * el proceso; sin esto, un SIGTERM se lleva por delante las trazas del último
 * turno, que suelen ser justo las interesantes cuando algo va mal.
 */
const inFlight = new Set<Promise<void>>();

/** Identificador de un turno completo. Se genera antes de la primera fila. */
export function newRunId(): string {
  return randomUUID();
}

/**
 * Recorta el payload antes de guardarlo.
 *
 * El resultado de una herramienta puede ser un JSON de megabytes. Guardarlo
 * entero infla la tabla sin aportar: para auditar basta con el principio, y lo
 * completo ya está en `tool_invocations`.
 */
function truncatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= config.TRACE_MAX_PAYLOAD_CHARS) return payload;

  return {
    _truncated: true,
    _original_chars: serialized.length,
    preview: serialized.slice(0, config.TRACE_MAX_PAYLOAD_CHARS),
  };
}

async function write(entry: TraceEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO agent_traces
         (conversation_id, run_id, iteration, step_type, tool_name,
          payload, latency_ms, tokens_used, agent_role, agent_name, parent_run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.conversationId,
        entry.runId,
        entry.iteration,
        entry.stepType,
        entry.toolName ?? null,
        JSON.stringify(truncatePayload(entry.payload ?? {})),
        entry.latencyMs ?? null,
        entry.tokensUsed ?? null,
        entry.agentRole ?? 'orchestrator',
        entry.agentName ?? null,
        entry.parentRunId ?? null,
      ],
    );
  } catch (err) {
    // A stdout y punto. Ni se relanza ni se propaga: el bucle de razonamiento
    // sigue su camino sin enterarse.
    console.error(
      `[telemetry] traza perdida (run=${entry.runId} paso=${entry.stepType}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Registra un paso sin esperar a que se guarde.
 *
 * Devuelve `void`, no una promesa, a propósito: si devolviera una promesa,
 * antes o después alguien le pondría un `await` delante y el bucle empezaría a
 * bloquearse por la auditoría. El tipo de retorno es la documentación.
 */
export function trace(entry: TraceEntry): void {
  if (!config.TRACE_ENABLED) return;

  const promise = write(entry).finally(() => inFlight.delete(promise));
  inFlight.add(promise);
}

/**
 * Enlaza las trazas de un turno con el mensaje que lo cerró.
 *
 * Se hace al final porque el `message_id` no existe hasta que el turno termina.
 * Un turno con trazas y sin `message_id` es, por sí solo, una señal: o sigue en
 * curso, o murió a mitad.
 */
export function linkRunToMessage(runId: string, messageId: string): void {
  if (!config.TRACE_ENABLED) return;

  const promise = query(`UPDATE agent_traces SET message_id = $2 WHERE run_id = $1`, [
    runId,
    messageId,
  ])
    .then(() => undefined)
    .catch((err: unknown) => {
      console.error(
        `[telemetry] no se pudo enlazar el run ${runId} con el mensaje:`,
        err instanceof Error ? err.message : err,
      );
    })
    .finally(() => inFlight.delete(promise));

  inFlight.add(promise);
}

/**
 * Espera a que terminen las escrituras en vuelo.
 *
 * Para el apagado ordenado y para las pruebas. En el camino normal no se llama:
 * ahí lo que se quiere es justamente no esperar.
 */
export async function flushTraces(timeoutMs = 5_000): Promise<void> {
  if (inFlight.size === 0) return;

  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Cuántas escrituras hay en vuelo. Solo para pruebas y diagnóstico. */
export function pendingTraceCount(): number {
  return inFlight.size;
}

// ── Consultas de lectura ─────────────────────────────────────────

export interface TraceRow {
  id: string;
  run_id: string;
  iteration: number;
  step_type: AgentStepType;
  tool_name: string | null;
  payload: Record<string, unknown>;
  latency_ms: number | null;
  tokens_used: number | null;
  created_at: Date;
}

/**
 * Reconstruye un turno completo, en orden.
 *
 * El orden lo da `(iteration, created_at)` y no el orden de inserción: con
 * escrituras que no esperan, dos filas de la misma vuelta pueden llegar
 * cambiadas.
 */
export async function getRun(runId: string): Promise<TraceRow[]> {
  return query<TraceRow>(
    `SELECT id, run_id, iteration, step_type, tool_name, payload,
            latency_ms, tokens_used, created_at
       FROM agent_traces
      WHERE run_id = $1
      ORDER BY iteration, created_at`,
    [runId],
  );
}

/** Los últimos turnos de una conversación, del más reciente al más antiguo. */
export async function getConversationTraces(
  conversationId: string,
  limit = 100,
): Promise<TraceRow[]> {
  return query<TraceRow>(
    `SELECT id, run_id, iteration, step_type, tool_name, payload,
            latency_ms, tokens_used, created_at
       FROM agent_traces
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [conversationId, limit],
  );
}

/**
 * Purga las trazas viejas.
 *
 * Es la tabla que más crece del esquema: varias filas por turno, frente a dos de
 * `messages`. Sin purga programada acaba siendo la tabla más grande de la base
 * de datos y la más inútil, porque nadie audita un turno de hace ocho meses.
 */
export async function purgeOldTraces(olderThanDays: number): Promise<number> {
  const rows = await query<{ count: string }>(
    `WITH borradas AS (
       DELETE FROM agent_traces
        WHERE created_at < NOW() - ($1 || ' days')::interval
        RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM borradas`,
    [String(olderThanDays)],
  );
  return Number(rows[0]?.count ?? 0);
}
