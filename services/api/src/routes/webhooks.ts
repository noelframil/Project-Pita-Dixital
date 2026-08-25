import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import { think } from '../core/brain.js';
import { claimProviderMessage } from '../core/conversations.js';
import { whatsappAdapter } from '../channels/whatsapp.js';
import { twilioAdapter } from '../channels/twilio.js';
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

import { ingest } from '../media/ingest.js';
import type { MediaInput } from '../media/types.js';

async function handleEvent(event: InboundEvent, account: ChannelAccount, adapter: any, app: any) {
  if (!(await claimProviderMessage(event.eventId))) {
    app.log.debug({ eventId: event.eventId }, 'evento duplicado, ignorado');
    return;
  }

  let ingested;
  try {
    // Descargar/resolver los adjuntos si los hay
    const mediaInputs: MediaInput[] = [];
    if (event.content.media) {
      for (const m of event.content.media) {
        if (adapter.resolveMedia) {
          mediaInputs.push(await adapter.resolveMedia(m, account));
        }
      }
    }

    ingested = await ingest({
      text: event.content.text,
      media: mediaInputs.length > 0 ? mediaInputs : undefined,
    });
  } catch (err: any) {
    app.log.error({ err }, 'Error ingiriendo media en webhook');
    // Si falla el media completamente, se aborta o se procesa con error. Para mantenerlo simple, abortamos o procesamos texto vacío si no hay fallback.
    ingested = { message: '', sourceKind: 'text', mediaCostMicros: 0, extractions: [], failures: [{ kind: 'media', userMessage: err.message }] };
  }

  let message = ingested?.message || '';
  if (!message.trim() && ingested?.failures && ingested.failures.length > 0) {
    message = ingested.failures[0]?.userMessage || '';
  }

  if (!message || !message.trim()) return;

  const result = await think({
    clientId: event.clientId,
    channel: event.channel,
    channelUserId: event.sender.channelUserId,
    threadRef: event.threadRef,
    message,
    displayName: event.sender.displayName,
    channelAccountId: account.id,
    providerMsgId: event.eventId,
    sourceKind: ingested.sourceKind as any,
    mediaCostMicros: ingested.mediaCostMicros,
    images: ingested.images,
  });

  if (result.handedOff) return;

  let outboundMedia;
  let replyText = result.reply;
  
  // Buscar etiqueta de adjunto: [FILE:/ruta/al/archivo.pdf]
  const fileMatch = replyText.match(/\[FILE:(.+?)\]/);
  if (fileMatch) {
    const filePath = fileMatch[1]!.trim();
    replyText = replyText.replace(fileMatch[0], '').trim();
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      outboundMedia = {
        kind: isImage ? 'image' : 'document',
        buffer,
        mime: isImage ? `image/${ext.replace('.', '')}` : 'application/pdf'
      };
    } catch (err) {
      app.log.error({ err, filePath }, 'Error adjuntando archivo de salida');
    }
  } else if (ingested.sourceKind === 'audio') {
    try {
      const { generateAudio } = await import('../media/audio.js');
      const buffer = await generateAudio(replyText);
      outboundMedia = {
        kind: 'audio' as const,
        buffer,
        mime: 'audio/ogg'
      };
    } catch (err) {
      app.log.error({ err }, 'Error generando TTS de respuesta');
    }
  }

  for (const out of adapter.render(replyText, event.threadRef, outboundMedia)) {
    await adapter.send(out, account);
  }

  app.log.info(
    {
      channel: event.channel,
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
      handleEvent(event, account, emailAdapter, app).catch(err => {
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
      handleEvent(event, account, whatsappAdapter, app).catch(err => {
        app.log.error({ err, eventId: event.eventId }, 'fallo procesando evento de WhatsApp');
      });
    }
  });

  // Webhook de Twilio para llamadas (TwiML)
  app.post('/api/v1/webhooks/twilio', async (req, reply) => {
    // Para simplificar MVP, tomamos la primera cuenta Twilio activa
    const rows = await query<{ id: string, client_id: string, external_id: string, credentials: Buffer }>(
      `SELECT id, client_id, external_id, credentials FROM channel_accounts WHERE channel = 'twilio' AND is_active = TRUE LIMIT 1`
    );
    
    if (rows.length === 0) {
      app.log.warn('No active twilio account');
      return reply.code(200).type('text/xml').send('<Response><Say language="es-ES">Sistema no configurado.</Say></Response>');
    }
    
    const account: ChannelAccount = {
      id: rows[0]!.id,
      clientId: rows[0]!.client_id,
      channel: 'twilio',
      externalId: rows[0]!.external_id,
      credentials: decryptJson(rows[0]!.credentials),
    };

    const payload = req.body as any;
    const events = twilioAdapter.parse(payload, account);

    if (events.length === 0) {
      // Iniciar llamada, pedir que hable
      return reply.code(200).type('text/xml').send('<Response><Gather input="speech" action="/api/v1/webhooks/twilio" language="es-ES"><Say language="es-ES">Hola, soy Pita Dixital. ¿En qué puedo ayudarte?</Say></Gather></Response>');
    }

    const event = events[0]!;
    
    // Procesar la entrada con IA
    const result = await think({
      clientId: event.clientId,
      channel: event.channel,
      channelUserId: event.sender.channelUserId,
      threadRef: event.threadRef,
      message: event.content.text || '',
      displayName: event.sender.displayName,
      channelAccountId: account.id,
      providerMsgId: event.eventId,
    });

    // Twilio Response TwiML
    const twiml = `
      <Response>
        <Gather input="speech" action="/api/v1/webhooks/twilio" language="es-ES">
          <Say language="es-ES" voice="Polly.Lucia-Neural">${result.reply}</Say>
        </Gather>
      </Response>
    `;

    reply.code(200).type('text/xml').send(twiml);
  });
};
