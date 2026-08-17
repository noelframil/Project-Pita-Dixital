import { query, queryOne, transaction } from '../db.js';
import type { ChatMessage } from '../llm/index.js';

export type ChannelKind =
  | 'web' | 'whatsapp' | 'sms' | 'voice' | 'email' | 'telegram'
  | 'instagram' | 'messenger' | 'youtube' | 'tiktok' | 'linkedin' | 'x';

export interface Conversation {
  id: string;
  contact_id: string | null;
  status: string;
  /** Resumen acumulado de la parte antigua. Null mientras nada se haya recortado. */
  summary: string | null;
  /** Marca de agua: lo anterior a esta fecha ya vive dentro de `summary`. */
  summarized_until: Date | null;
}

/**
 * Resuelve contacto y conversación en una transacción.
 *
 * La clave del sistema omnicanal está aquí: `contact_identities` es única por
 * (canal, id de usuario en ese canal), así que la misma persona escribiendo
 * por WhatsApp el martes y por Instagram el jueves converge en un contacto.
 */
export async function resolveConversation(params: {
  clientId: string;
  channel: ChannelKind;
  channelUserId: string;
  threadRef: string;
  displayName?: string;
  channelAccountId?: string | null;
}): Promise<Conversation> {
  return transaction(async (client) => {
    const identity = await client.query<{ contact_id: string }>(
      `SELECT contact_id FROM contact_identities
        WHERE channel = $1 AND channel_user_id = $2`,
      [params.channel, params.channelUserId],
    );

    let contactId = identity.rows[0]?.contact_id;

    if (!contactId) {
      const contact = await client.query<{ id: string }>(
        `INSERT INTO contacts (client_id, display_name) VALUES ($1, $2) RETURNING id`,
        [params.clientId, params.displayName ?? null],
      );
      contactId = contact.rows[0]!.id;

      // ON CONFLICT por si dos mensajes del mismo usuario entran a la vez.
      await client.query(
        `INSERT INTO contact_identities (contact_id, channel, channel_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (channel, channel_user_id) DO NOTHING`,
        [contactId, params.channel, params.channelUserId],
      );
    }

    const convo = await client.query<Conversation>(
      `INSERT INTO conversations
         (client_id, contact_id, channel_account_id, channel, thread_ref, last_message_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, channel, thread_ref)
         DO UPDATE SET last_message_at = NOW()
       RETURNING id, contact_id, status, summary, summarized_until`,
      [
        params.clientId,
        contactId,
        params.channelAccountId ?? null,
        params.channel,
        params.threadRef,
      ],
    );

    return convo.rows[0]!;
  });
}

/**
 * Un mensaje del historial con su fecha.
 *
 * La fecha viaja al lado y no dentro de `ChatMessage` porque `ChatMessage` es lo
 * que se le manda al proveedor, y ahí no pinta nada. Aquí hace falta para saber
 * exactamente hasta dónde llega el resumen.
 */
export interface HistoryEntry {
  message: ChatMessage;
  createdAt: Date;
}

/**
 * Historial sin resumir, en orden cronológico. Se piden invertidos y se le da la
 * vuelta: así el índice (conversation_id, created_at DESC) sirve directamente.
 *
 * `since` es la marca de agua del resumen: lo anterior ya está condensado en
 * `conversations.summary` y traerlo otra vez sería contarlo dos veces.
 *
 * `turns` deja de ser el recorte fino — de eso se encarga el presupuesto de
 * tokens en `memory.ts` — y pasa a ser el tope de lo que se lee de la base de
 * datos, para que una conversación de mil mensajes no se traiga entera.
 *
 * Los mensajes con rol `tool` quedan fuera a propósito: ver la nota sobre el
 * alcance del bucle de herramientas en `brain.ts`.
 */
export async function loadHistory(
  conversationId: string,
  turns: number,
  since?: Date | null,
): Promise<HistoryEntry[]> {
  const rows = await query<{ role: string; text: string | null; created_at: Date }>(
    `SELECT role, text, created_at FROM messages
      WHERE conversation_id = $1
        AND role IN ('user','assistant')
        AND text IS NOT NULL
        AND ($3::timestamptz IS NULL OR created_at > $3)
      ORDER BY created_at DESC
      LIMIT $2`,
    [conversationId, turns * 2, since ?? null],
  );

  return rows.reverse().map((r) => ({
    message: { role: r.role as 'user' | 'assistant', content: r.text! },
    createdAt: r.created_at,
  }));
}

/**
 * Guarda el resumen y avanza la marca de agua.
 *
 * La marca es la fecha del último mensaje resumido, nunca `NOW()`: entre que se
 * leyó el historial y se guarda el resumen pueden haber entrado mensajes nuevos,
 * y usar la hora actual los daría por resumidos sin estarlo — desaparecerían del
 * contexto sin llegar a entrar en ningún resumen.
 */
export async function saveSummary(
  conversationId: string,
  summary: string,
  summarizedUntil: Date,
): Promise<void> {
  await query(
    `UPDATE conversations SET summary = $2, summarized_until = $3 WHERE id = $1`,
    [conversationId, summary, summarizedUntil],
  );
}

export async function recordMessage(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  providerMsgId?: string | null;
  model?: string | null;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  costMicros?: number | null;
  latencyMs?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO messages
       (conversation_id, role, text, provider_msg_id, model,
        tokens_prompt, tokens_completion, cost_micros, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (provider_msg_id) WHERE provider_msg_id IS NOT NULL DO NOTHING`,
    [
      params.conversationId,
      params.role,
      params.text,
      params.providerMsgId ?? null,
      params.model ?? null,
      params.tokensPrompt ?? null,
      params.tokensCompletion ?? null,
      params.costMicros ?? null,
      params.latencyMs ?? null,
    ],
  );
}

/**
 * Reclama un evento entrante. Devuelve false si ya se procesó.
 * Meta y Twilio reintentan el webhook; sin esto el bot contesta dos veces.
 */
export async function claimProviderMessage(providerMsgId: string): Promise<boolean> {
  const existing = await queryOne(
    `SELECT 1 AS ok FROM messages WHERE provider_msg_id = $1`,
    [providerMsgId],
  );
  return existing === null;
}
