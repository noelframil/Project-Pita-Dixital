import type { ChannelAccount, ChannelAdapter, InboundEvent, OutboundMessage } from './types.js';

export const twilioAdapter: ChannelAdapter = {
  channel: 'twilio' as any,

  limits: {
    maxChars: 1600,
    markdown: false,
  },

  parse(payload: unknown, account: ChannelAccount): InboundEvent[] {
    const body = payload as any;
    
    // TwiML Voice webhook
    // If it's a call, the user speaks and Twilio sends `SpeechResult`
    const text = body.SpeechResult || body.Body || '';
    const callSid = body.CallSid || body.MessageSid;
    const from = body.From;

    if (!callSid || !from) return [];

    return [
      {
        eventId: `tw:${callSid}:${Date.now()}`,
        receivedAt: new Date().toISOString(),
        clientId: account.clientId,
        accountId: account.id,
        channel: 'twilio' as any,
        sender: {
          channelUserId: from,
        },
        threadRef: callSid,
        surface: body.CallSid ? 'call' : 'dm',
        content: { text },
        raw: payload,
      }
    ];
  },

  render(reply: string, threadRef: string): OutboundMessage[] {
    return [{ threadRef, text: reply }];
  },

  async send(msg: OutboundMessage, account: ChannelAccount) {
    // Para enviar SMS asíncronos o iniciar llamadas.
    // En el caso del flujo de voz TwiML, la respuesta va en el propio webhook HTTP 200.
    return { providerMsgId: `tw:out:${Date.now()}` };
  },
};
