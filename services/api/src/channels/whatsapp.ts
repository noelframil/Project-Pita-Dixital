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
          if (msg.type !== 'text' || !msg.text) continue;
          
          const contact = value.contacts?.find(c => c.wa_id === msg.from);

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
            // En WhatsApp, el número de teléfono del usuario (msg.from) sirve como hilo
            threadRef: msg.from,
            surface: 'dm',
            content: { text: msg.text.body },
            raw: payload,
          });
        }
      }
    }

    return events;
  },

  render(reply: string, threadRef: string): OutboundMessage[] {
    return renderForChannel(reply, 'whatsapp', {
      maxChars: whatsappAdapter.limits.maxChars,
    }).map((text) => ({ threadRef, text }));
  },

  async send(msg: OutboundMessage, account: ChannelAccount) {
    const phoneNumberId = account.credentials.phoneNumberId;
    const token = account.credentials.accessToken;

    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.threadRef,
        type: 'text',
        text: { body: msg.text },
      }),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new Error(`WhatsApp sendMessage falló: ${data.error?.message ?? res.status}`);
    }

    return { providerMsgId: `wa:out:${data.messages?.[0]?.id ?? Date.now()}` };
  },
};
