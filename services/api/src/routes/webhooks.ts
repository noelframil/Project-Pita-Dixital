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

export const webhookRoutes: FastifyPluginAsync = async (app) => {
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
    // El cuerpo crudo lo conserva el parser registrado en index.ts. Sin él no
    // hay firma que validar: reserializar el objeto ya parseado cambia
    // espacios y orden de claves, y el HMAC nunca cuadraría.
    const rawBody = (req as unknown as { rawBody?: string }).rawBody;

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

    // Verificación de firma. Va aquí y no antes porque el secreto es por
    // cuenta: hasta saber a qué número va dirigido no hay con qué comparar.
    //
    // Un 200 a lo no verificado convertiría esto en un endpoint abierto:
    // cualquiera que conozca la URL podría inyectar mensajes y hacer responder
    // al bot, gastando tokens y ensuciando conversaciones reales.
    const headers = req.headers as Record<string, string>;
    if (!rawBody || !whatsappAdapter.verify?.(rawBody, headers, account)) {
      app.log.warn({ phoneNumberId }, 'firma de webhook inválida: descartado');
      return reply.code(401).send('invalid signature');
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
