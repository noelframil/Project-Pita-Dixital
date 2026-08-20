import type { FastifyBaseLogger } from 'fastify';
import { query } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import { think } from '../core/brain.js';
import { claimProviderMessage } from '../core/conversations.js';
import { renderForChannel } from './outputFormatter.js';
import type {
  ChannelAccount,
  ChannelAdapter,
  InboundEvent,
  OutboundMessage,
} from './types.js';

const API = 'https://api.telegram.org/bot';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

export const telegramAdapter: ChannelAdapter = {
  channel: 'telegram',

  limits: {
    maxChars: 4096,
    markdown: true,
  },

  parse(payload: unknown, account: ChannelAccount): InboundEvent[] {
    const update = payload as TelegramUpdate;
    const msg = update.message;
    if (!msg?.text || !msg.from) return [];

    return [
      {
        eventId: `telegram:${account.externalId}:${update.update_id}`,
        receivedAt: new Date(msg.date * 1000).toISOString(),
        clientId: account.clientId,
        accountId: account.id,
        channel: 'telegram',
        sender: {
          channelUserId: String(msg.from.id),
          displayName: msg.from.first_name ?? msg.from.username,
        },
        threadRef: String(msg.chat.id),
        surface: 'dm',
        content: { text: msg.text },
        raw: payload,
      },
    ];
  },

  render(reply: string, threadRef: string): OutboundMessage[] {
    // Formatea para Telegram y luego trocea. En ese orden: al revés, una
    // negrita podría partirse entre dos mensajes y no renderizar en ninguno.
    return renderForChannel(reply, 'telegram', {
      maxChars: telegramAdapter.limits.maxChars,
    }).map((text) => ({ threadRef, text }));
  },

  async send(msg: OutboundMessage, account: ChannelAccount) {
    const res = await fetch(`${API}${account.credentials.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ chat_id: msg.threadRef, text: msg.text }),
    });

    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { message_id: number };
    };
    if (!data.ok) {
      throw new Error(`Telegram sendMessage falló: ${data.description ?? res.status}`);
    }

    return { providerMsgId: `telegram:out:${data.result?.message_id ?? Date.now()}` };
  },
};

// ── Polling ──────────────────────────────────────────────────────
//
// En desarrollo se usa long polling en lugar de webhook: no hace falta túnel
// ni dominio público. En producción se cambia a webhook con secret_token, que
// escala mejor y no mantiene una conexión abierta por bot.

async function loadTelegramAccounts(): Promise<ChannelAccount[]> {
  const rows = await query<{
    id: string;
    client_id: string;
    external_id: string;
    credentials: Buffer;
  }>(
    `SELECT id, client_id, external_id, credentials
       FROM channel_accounts
      WHERE channel = 'telegram' AND is_active = TRUE`,
  );

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    channel: 'telegram' as const,
    externalId: r.external_id,
    credentials: decryptJson<Record<string, string>>(r.credentials),
  }));
}

async function handleEvent(event: InboundEvent, account: ChannelAccount, log: FastifyBaseLogger) {
  // Telegram reenvía updates no confirmados tras un reinicio.
  if (!(await claimProviderMessage(event.eventId))) {
    log.debug({ eventId: event.eventId }, 'evento duplicado, ignorado');
    return;
  }

  const result = await think({
    clientId: event.clientId,
    channel: 'telegram',
    channelUserId: event.sender.channelUserId,
    threadRef: event.threadRef,
    message: event.content.text ?? '',
    displayName: event.sender.displayName,
    channelAccountId: account.id,
    providerMsgId: event.eventId,
  });

  if (result.handedOff) return;

  for (const out of telegramAdapter.render(result.reply, event.threadRef)) {
    await telegramAdapter.send(out, account);
  }

  log.info(
    {
      channel: 'telegram',
      tokens: result.usage.totalTokens,
      costMicros: result.costMicros,
      latencyMs: result.latencyMs,
    },
    'respuesta enviada',
  );
}

async function pollAccount(account: ChannelAccount, log: FastifyBaseLogger, stopped: () => boolean) {
  let offset = 0;

  while (!stopped()) {
    try {
      const res = await fetch(`${API}${account.credentials.botToken}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 25 s de long poll + margen: el timeout del fetch va por encima.
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({ offset, timeout: 25, allowed_updates: ['message'] }),
      });

      const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!data.ok || !data.result) continue;

      for (const update of data.result) {
        // El offset avanza aunque el mensaje falle: si no, un mensaje que
        // siempre revienta bloquea la cola del bot para siempre.
        offset = update.update_id + 1;

        for (const event of telegramAdapter.parse(update, account)) {
          try {
            await handleEvent(event, account, log);
          } catch (err) {
            log.error({ err, eventId: event.eventId }, 'fallo procesando evento de Telegram');
          }
        }
      }
    } catch (err) {
      if (stopped()) return;
      log.warn({ err }, 'fallo en el polling de Telegram, reintentando en 5 s');
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

export async function startTelegramPolling(log: FastifyBaseLogger): Promise<() => void> {
  const accounts = await loadTelegramAccounts();

  if (accounts.length === 0) {
    log.info('Sin cuentas de Telegram configuradas. Enlaza una con: npm run admin -- link-telegram');
    return () => {};
  }

  let stopped = false;
  for (const account of accounts) {
    log.info({ account: account.externalId }, 'Telegram: iniciando polling');
    void pollAccount(account, log, () => stopped);
  }

  return () => {
    stopped = true;
  };
}
