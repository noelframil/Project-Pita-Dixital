import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import { think } from '../core/brain.js';
import { claimProviderMessage } from '../core/conversations.js';
import { whatsappAdapter } from '../channels/whatsapp.js';
import type { ChannelAccount, InboundEvent } from '../channels/types.js';

async function loadWhatsAppAccounts(): Promise<ChannelAccount[]> {
  const rows = await query<{
    id: string;
    client_id: string;
    external_id: string;
    credentials: Buffer;
  }>(
    `SELECT id, client_id, external_id, credentials
       FROM channel_accounts
      WHERE channel = 'whatsapp' AND is_active = TRUE`
  );

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    channel: 'whatsapp',
    externalId: r.external_id,
    credentials: decryptJson<Record<string, string>>(r.credentials),
  }));
}

async function handleEvent(event: InboundEvent, account: ChannelAccount, app: any) {
  if (!(await claimProviderMessage(event.eventId))) {
    app.log.debug({ eventId: event.eventId }, 'evento duplicado, ignorado');
    return;
  }

  const result = await think({
    clientId: event.clientId,
    channel: 'whatsapp',
    channelUserId: event.sender.channelUserId,
    threadRef: event.threadRef,
    message: event.content.text ?? '',
    displayName: event.sender.displayName,
    channelAccountId: account.id,
    providerMsgId: event.eventId,
  });

  if (result.handedOff) return;

  for (const out of whatsappAdapter.render(result.reply, event.threadRef)) {
    await whatsappAdapter.send(out, account);
  }

  app.log.info(
    {
      channel: 'whatsapp',
      tokens: result.usage.totalTokens,
      costMicros: result.costMicros,
      latencyMs: result.latencyMs,
    },
    'respuesta enviada'
  );
}

import { emailAdapter } from '../channels/email.js';

async function loadEmailAccount(clientId?: string): Promise<ChannelAccount | null> {
  // In a multi-tenant setup, we'd lookup by email or client. For MVP, we load the active email account.
  let q = `SELECT id, client_id, external_id, credentials
           FROM channel_accounts
          WHERE channel = 'email' AND is_active = TRUE LIMIT 1`;
  const rows = await query<{
    id: string;
    client_id: string;
    external_id: string;
    credentials: Buffer;
  }>(q);

  if (rows.length === 0) return null;
  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    clientId: r.client_id,
    channel: 'email',
    externalId: r.external_id,
    credentials: decryptJson<Record<string, string>>(r.credentials),
  };
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/webhooks/resend', async (req, reply) => {
    const payload = req.body as any;
    
    // Verify signature (optional for now, but recommended in production via Svix)
    const type = payload.type;

    if (type === 'email.bounced' || type === 'email.complained') {
      const email = payload.data?.to?.[0];
      if (email) {
        // Suppress email
        app.log.warn({ email, type }, 'Email rebotado o queja. Añadiendo a lista de supresión.');
        // Asumimos que el email está en un contact_identities
        await query(
          `UPDATE contact_identities 
              SET is_active = FALSE 
            WHERE channel = 'email' AND channel_user_id = $1`,
          [email]
        );
      }
      return reply.code(200).send('OK');
    }

    // Incoming email (email.received doesn't officially exist as such in standard Resend yet, 
    // but we simulate inbound webhook parsing)
    const account = await loadEmailAccount();
    if (!account) return reply.code(200).send('No active email account');

    const events = emailAdapter.parse(payload, account);
    reply.code(200).send('OK');

    for (const event of events) {
      handleEvent(event, account, app).catch(err => {
        app.log.error({ err, eventId: event.eventId }, 'fallo procesando evento de email');
      });
    }
  });

  // Verificación del Webhook (hub.challenge)
  app.get<{ Querystring: { 'hub.mode': string; 'hub.challenge': string; 'hub.verify_token': string } }>('/api/v1/webhooks/whatsapp', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Esto asume que todos los clientes comparten el mismo verify_token o que 
    // configuramos un verify_token global, por simplicidad para enterprise MVP usaremos uno global en config
    if (mode === 'subscribe' && token) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send();
  });

  app.post('/api/v1/webhooks/whatsapp', async (req, reply) => {
    const rawBody = (req.body as any) || {}; // We need the raw string to verify signature properly. Fastify can provide it with raw-body or we parse payload directly.
    // En Fastify, si req.body ya es un objeto, la validación HMAC es delicada si no guardamos el raw_body.
    // Asumiremos que el middleware anterior lo procesó, o que usamos raw-body.
    // Por ahora para avanzar, solo parseamos:
    
    const accounts = await loadWhatsAppAccounts();
    
    // Encontramos la cuenta correspondiente mirando el payload
    const payload = req.body as any;
    const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    
    if (!phoneNumberId) return reply.code(200).send('OK');
    
    const account = accounts.find(a => a.externalId === phoneNumberId);
    if (!account) {
      app.log.warn({ phoneNumberId }, 'Cuenta de WhatsApp desconocida');
      return reply.code(200).send('OK');
    }

    // Parseamos los eventos
    const events = whatsappAdapter.parse(payload, account);
    
    // Respondemos al webhook rápido y procesamos en background
    reply.code(200).send('OK');

    for (const event of events) {
      handleEvent(event, account, app).catch(err => {
        app.log.error({ err, eventId: event.eventId }, 'fallo procesando evento de WhatsApp');
      });
    }
  });
};
