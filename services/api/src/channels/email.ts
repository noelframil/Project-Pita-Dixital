import { Resend } from 'resend';
import type { ChannelAdapter, InboundEvent, OutboundMessage, ChannelAccount } from './types.js';
import { config } from '../config.js';

// Inicializamos de forma perezosa para evitar que la aplicación crashee en el arranque si no hay API key
let resendClient: Resend | null = null;
function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY || 're_123456789');
  }
  return resendClient;
}

export const emailAdapter: ChannelAdapter = {
  channel: 'email',
  limits: {
    maxChars: 10000,
    markdown: true,
  },

  parse(payload: any, account: ChannelAccount): InboundEvent[] {
    // Resend Inbound Webhook Format
    // Payload contains 'from', 'to', 'subject', 'text', 'html', etc.
    const fromEmail = payload.from;
    const toEmail = payload.to?.[0]; // Our bot's email
    const messageId = payload.messageId || `email-${Date.now()}`;
    const text = payload.text || payload.html || '';

    if (!fromEmail) return [];

    // Extraemos el email limpio sin el nombre, ej: "Juan <juan@ejemplo.com>" -> "juan@ejemplo.com"
    const emailMatch = fromEmail.match(/<([^>]+)>/);
    const cleanEmail = emailMatch ? emailMatch[1] : fromEmail;
    const displayNameMatch = fromEmail.match(/^([^<]+)</);
    const displayName = displayNameMatch ? displayNameMatch[1].trim() : cleanEmail;

    return [{
      eventId: messageId,
      receivedAt: new Date().toISOString(),
      clientId: account.clientId,
      accountId: account.id,
      channel: 'email',
      sender: {
        channelUserId: cleanEmail,
        displayName: displayName.replace(/["']/g, ''),
      },
      threadRef: cleanEmail, // In email, the thread is typically the email address or Subject
      surface: 'dm',
      content: {
        text: text.trim(),
      },
      raw: payload,
    }];
  },

  render(reply: string, threadRef: string, media?: OutboundMessage['media']): OutboundMessage[] {
    return [{ threadRef, text: reply, media }];
  },

  async send(msg: OutboundMessage, account: ChannelAccount) {
    const fromEmail = account.credentials['FROM_EMAIL'];
    if (!fromEmail) throw new Error('Missing FROM_EMAIL credential for account');

    const attachments = msg.media ? [{
      filename: `voice_note.${msg.media.mime.split('/')[1] || 'ogg'}`,
      content: msg.media.buffer
    }] : undefined;

    const { data, error } = await getResendClient().emails.send({
      from: fromEmail,
      to: msg.threadRef,
      subject: 'Respuesta automática de Pita Dixital',
      text: msg.text,
      attachments,
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return { providerMsgId: data?.id || `sent-${Date.now()}` };
  }
};
