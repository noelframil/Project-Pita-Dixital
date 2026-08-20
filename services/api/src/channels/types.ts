import type { ChannelKind } from '../core/conversations.js';

export type { ChannelKind };

/** Todo lo que entra se normaliza a esta forma antes de tocar el núcleo. */
export interface InboundEvent {
  /** Id del proveedor. Clave de idempotencia: los webhooks se reintentan. */
  eventId: string;
  receivedAt: string;
  clientId: string;
  accountId: string;
  channel: ChannelKind;

  sender: {
    channelUserId: string;
    displayName?: string;
  };

  /** Hilo, publicación o llamada donde ocurre. En voz, el CallSid. */
  threadRef: string;

  /**
   * Un comentario lo lee todo el mundo; un DM no. El prompt del sistema debe
   * cambiar según esto: en público, respuestas cortas y sin datos personales.
   */
  surface: 'dm' | 'comment' | 'mention' | 'call' | 'review';

  content: {
    text?: string;
    media?: Array<{ kind: 'audio' | 'image' | 'video' | 'file'; url: string; mime: string }>;
  };

  /** El payload original. Depurar sin él es imposible. */
  raw: unknown;
}

export interface OutboundMessage {
  threadRef: string;
  text: string;
}

export interface ChannelAccount {
  id: string;
  clientId: string;
  channel: ChannelKind;
  externalId: string;
  credentials: Record<string, string>;
}

export interface ChannelLimits {
  maxChars: number;
  markdown: boolean;
  /** Ventana de respuesta libre. Meta corta a las 24 h. */
  replyWindowHours?: number;
}

export interface ChannelAdapter {
  readonly channel: ChannelKind;
  readonly limits: ChannelLimits;

  /** Verifica la firma del proveedor sobre el cuerpo CRUDO. Falso ⇒ 401. */
  verify?(rawBody: string, headers: Record<string, string>, account: ChannelAccount): boolean;

  /** Un webhook puede traer varios eventos: Meta los agrupa por lotes. */
  parse(payload: unknown, account: ChannelAccount): InboundEvent[];

  /** Adapta la respuesta a los límites del canal ANTES de enviarla. */
  render(reply: string, threadRef: string): OutboundMessage[];

  send(msg: OutboundMessage, account: ChannelAccount): Promise<{ providerMsgId: string }>;
}

// El troceado y el formateo viven juntos en `outputFormatter.ts`, porque el
// orden entre ambos importa: primero formatear, después trocear. Se reexportan
// desde aquí para que los adaptadores sigan teniendo una sola puerta.
export { renderForChannel, splitForChannel, formatForChannel } from './outputFormatter.js';
