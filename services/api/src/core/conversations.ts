import { query, queryOne, transaction } from '../db.js';
import type { ChatMessage } from '../llm/index.js';

export type ChannelKind =
  | 'web' | 'whatsapp' | 'sms' | 'voice' | 'email' | 'telegram'
  | 'instagram' | 'messenger' | 'youtube' | 'tiktok' | 'linkedin' | 'x';

export interface Conversation {
  id: string;
  contact_id: string | null;
  status: string;
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
       RETURNING id, contact_id, status`,
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
 * Últimos N turnos, en orden cronológico. Se piden invertidos y se le da la
 * vuelta: así el índice (conversation_id, created_at DESC) sirve directamente.
 */
export async function loadHistory(
  conversationId: string,
  turns: number,
): Promise<ChatMessage[]> {
  const rows = await query<{ role: string; text: string | null }>(
    `SELECT role, text FROM messages
      WHERE conversation_id = $1 AND role IN ('user','assistant') AND text IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $2`,
    [conversationId, turns * 2],
  );

  return rows
    .reverse()
    .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.text! }));
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
