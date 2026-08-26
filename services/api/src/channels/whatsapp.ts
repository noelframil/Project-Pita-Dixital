import crypto from 'node:crypto';
import type { ChannelAccount, ChannelAdapter, InboundEvent, OutboundMessage } from './types.js';
import { renderForChannel } from './outputFormatter.js';

const API_VERSION = 'v19.0';

// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
interface WhatsAppPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: { body: string };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',

  limits: {
    maxChars: 4096,
    markdown: true,
    replyWindowHours: 24,
  },

  verify(rawBody: string, headers: Record<string, string>, account: ChannelAccount): boolean {
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;

    const expected = 'sha256=' + crypto
      .createHmac('sha256', account.credentials.appSecret || '')
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  },

  /** Si el canal entrega IDs de medios en vez de URLs públicas, este método los descarga. */
  async resolveMedia(media: { kind: string; url: string; mime: string }, account: ChannelAccount) {
    if (media.url.startsWith('whatsapp-media://')) {
      const mediaId = media.url.replace('whatsapp-media://', '');
      const token = account.credentials.accessToken;

      // 1. Obtener la URL real del media
      const resInfo = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resInfo.ok) throw new Error(`Fallo al obtener info del media: ${resInfo.status}`);
      const info = await resInfo.json() as any;

      if (!info.url) throw new Error('WhatsApp no devolvió URL para el media.');

      // 2. Descargar el archivo
      const { fetchMedia } = await import('../media/ingest.js');
      return fetchMedia(info.url, media.kind as any, {
        'Authorization': `Bearer ${token}`
      });
    }
    throw new Error(`Media no soportado en whatsapp: ${media.url}`);
  },

  /** Un webhook puede traer varios eventos: Meta los agrupa por lotes. */
  parse(payload: unknown, account: ChannelAccount): InboundEvent[] {
    const body = payload as WhatsAppPayload;
    if (body.object !== 'whatsapp_business_account' || !body.entry) return [];

    const events: InboundEvent[] = [];

    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value || !value.messages) continue;

        for (const msg of value.messages) {
          const contact = value.contacts?.find(c => c.wa_id === msg.from);

          if (msg.type === 'text' && msg.text) {
            events.push({
              eventId: `wa:${msg.id}`,
              receivedAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              clientId: account.clientId,
              accountId: account.id,
              channel: 'whatsapp',
              sender: {
                channelUserId: msg.from,
                displayName: contact?.profile.name,
              },
              threadRef: msg.from,
              surface: 'dm',
              content: { text: msg.text.body },
              raw: payload,
            });
          } else if (msg.type === 'audio' && (msg as any).audio) {
            events.push({
              eventId: `wa:${msg.id}`,
              receivedAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              clientId: account.clientId,
              accountId: account.id,
              channel: 'whatsapp',
              sender: {
                channelUserId: msg.from,
                displayName: contact?.profile.name,
              },
              threadRef: msg.from,
              surface: 'dm',
              content: {
                media: [{
                  kind: 'audio',
                  url: `whatsapp-media://${(msg as any).audio.id}`,
                  mime: (msg as any).audio.mime_type || 'audio/ogg',
                }]
              },
              raw: payload,
            });
          } else if (msg.type === 'image' && (msg as any).image) {
            events.push({
              eventId: `wa:${msg.id}`,
              receivedAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              clientId: account.clientId,
              accountId: account.id,
              channel: 'whatsapp',
              sender: {
                channelUserId: msg.from,
                displayName: contact?.profile.name,
              },
              threadRef: msg.from,
              surface: 'dm',
              content: {
                media: [{
                  kind: 'image',
                  url: `whatsapp-media://${(msg as any).image.id}`,
                  mime: (msg as any).image.mime_type || 'image/jpeg',
                }]
              },
              raw: payload,
            });
          } else if (msg.type === 'document' && (msg as any).document) {
            events.push({
              eventId: `wa:${msg.id}`,
              receivedAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              clientId: account.clientId,
              accountId: account.id,
              channel: 'whatsapp',
              sender: {
                channelUserId: msg.from,
                displayName: contact?.profile.name,
              },
              threadRef: msg.from,
              surface: 'dm',
              content: {
                media: [{
                  kind: 'file',
                  url: `whatsapp-media://${(msg as any).document.id}`,
                  mime: (msg as any).document.mime_type || 'application/pdf',
                }]
              },
              raw: payload,
            });
          }
        }
      }
    }

    return events;
  },

  render(reply: string, threadRef: string, media?: OutboundMessage['media']): OutboundMessage[] {
    const messages = renderForChannel(reply, 'whatsapp', {
      maxChars: whatsappAdapter.limits.maxChars,
    }).map((text): OutboundMessage => ({ threadRef, text }));

    if (media && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last) last.media = media;
    }
    return messages;
  },

  async send(msg: OutboundMessage, account: ChannelAccount) {
    const phoneNumberId = account.credentials.phoneNumberId;
    const token = account.credentials.accessToken;

    let mediaId: string | undefined;
    if (msg.media) {
      // Si tenemos un buffer, hay que subirlo a WhatsApp primero para obtener un media id
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(msg.media.buffer)], { type: msg.media.mime }), 'voice_note.ogg');
      form.append('type', msg.media.mime);
      form.append('messaging_product', 'whatsapp');
      
      const uploadRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: form as any,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.text().catch(() => '');
        throw new Error(`Fallo subiendo media a WhatsApp: ${uploadRes.status} ${errBody}`);
      }
      const uploadData = await uploadRes.json() as any;
      mediaId = uploadData.id;
    }

    const body: any = {
      messaging_product: 'whatsapp',
      to: msg.threadRef,
    };
    
    if (mediaId) {
      if (msg.media?.kind === 'audio') {
        body.type = 'audio';
        body.audio = { id: mediaId };
      } else if (msg.media?.kind === 'image') {
        body.type = 'image';
        body.image = { id: mediaId, caption: msg.text };
      } else if (msg.media?.kind === 'document') {
        body.type = 'document';
        body.document = { id: mediaId, caption: msg.text, filename: 'documento.pdf' };
      }
    } else {
      body.type = 'text';
      body.text = { body: msg.text };
    }

    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new Error(`WhatsApp sendMessage falló: ${data.error?.message ?? res.status}`);
    }

    return { providerMsgId: `wa:out:${data.messages?.[0]?.id ?? Date.now()}` };
  },
};
