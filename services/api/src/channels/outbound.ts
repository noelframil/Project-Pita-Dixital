/**
 * Envío saliente por el canal que toque.
 *
 * Los adaptadores existentes se usaban solo dentro de su propio bucle de
 * entrada: el de Telegram recibía y contestaba en el mismo sitio. Con los
 * mensajes proactivos hace falta lo contrario — enviar sin que haya llegado
 * nada—, así que el envío necesita una puerta propia.
 */
import { query, queryOne } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import { telegramAdapter } from './telegram.js';
import { renderForChannel } from './outputFormatter.js';
import type { ChannelAccount, ChannelAdapter, ChannelKind } from './types.js';

const ADAPTERS: Partial<Record<ChannelKind, ChannelAdapter>> = {
  telegram: telegramAdapter,
};

export class OutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundError';
  }
}

/**
 * Carga la cuenta de canal por la que enviar.
 *
 * Se busca por conversación y no por cliente: un cliente puede tener varias
 * cuentas del mismo canal (dos bots de Telegram, dos números de WhatsApp), y
 * contestar por la que no es rompe el hilo desde el punto de vista del usuario.
 */
async function loadAccountForConversation(
  conversationId: string,
): Promise<ChannelAccount | null> {
  const row = await queryOne<{
    id: string;
    client_id: string;
    channel: ChannelKind;
    external_id: string;
    credentials: Buffer;
  }>(
    `SELECT a.id, a.client_id, a.channel, a.external_id, a.credentials
       FROM conversations c
       JOIN channel_accounts a ON a.id = c.channel_account_id
      WHERE c.id = $1 AND a.is_active`,
    [conversationId],
  );

  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id,
    channel: row.channel,
    externalId: row.external_id,
    credentials: decryptJson<Record<string, string>>(row.credentials),
  };
}

export interface SendResult {
  parts: number;
  providerMsgIds: string[];
}

/**
 * Envía un texto por el canal de una conversación.
 *
 * Formatea y trocea según el canal antes de salir: es el mismo camino que sigue
 * una respuesta normal, y saltárselo aquí haría que los mensajes proactivos
 * llegaran con Markdown crudo mientras los reactivos llegan limpios.
 */
export async function sendToConversation(
  conversationId: string,
  text: string,
): Promise<SendResult> {
  const convo = await queryOne<{ channel: ChannelKind; thread_ref: string }>(
    `SELECT channel, thread_ref FROM conversations WHERE id = $1`,
    [conversationId],
  );
  if (!convo) throw new OutboundError(`No existe la conversación ${conversationId}`);

  // El canal web no tiene envío saliente: el cliente consulta por HTTP. Un
  // proactivo en web se queda registrado y se entrega cuando el widget
  // pregunta, que es el comportamiento correcto y no un fallo.
  if (convo.channel === 'web') {
    return { parts: 0, providerMsgIds: [] };
  }

  const adapter = ADAPTERS[convo.channel];
  if (!adapter) {
    throw new OutboundError(
      `El canal "${convo.channel}" no tiene adaptador de envío todavía.`,
    );
  }

  const account = await loadAccountForConversation(conversationId);
  if (!account) {
    throw new OutboundError(
      `La conversación ${conversationId} no tiene cuenta de canal activa asociada.`,
    );
  }

  const parts = renderForChannel(text, convo.channel, { maxChars: adapter.limits.maxChars });
  const providerMsgIds: string[] = [];

  for (const part of parts) {
    const { providerMsgId } = await adapter.send(
      { threadRef: convo.thread_ref, text: part },
      account,
    );
    providerMsgIds.push(providerMsgId);
  }

  // El id del proveedor sirve de clave de idempotencia si el canal reenvía.
  if (providerMsgIds[0]) {
    await query(
      `UPDATE messages SET provider_msg_id = $2
        WHERE id = (SELECT id FROM messages
                     WHERE conversation_id = $1 AND provider_msg_id IS NULL
                     ORDER BY created_at DESC LIMIT 1)`,
      [conversationId, providerMsgIds[0]],
    );
  }

  return { parts: parts.length, providerMsgIds };
}
