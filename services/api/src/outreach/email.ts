/**
 * Envío de correo de captación.
 *
 * Dos cosas que no son opcionales aunque lo parezcan:
 *
 * 1. `List-Unsubscribe` y `List-Unsubscribe-Post`. Desde 2024 Gmail y Yahoo
 *    exigen baja en un clic a quien envía en volumen; sin esas cabeceras el
 *    correo va a spam por política, sin importar lo bueno que sea el texto.
 *
 * 2. Decir de dónde salió la dirección. Cuando los datos vienen de un tercero
 *    —Apollo, aquí— el RGPD obliga a informar del origen en el primer
 *    contacto. Una línea al pie lo resuelve; omitirla es lo que convierte una
 *    queja en una multa.
 */
import { config } from '../config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl: string;
}

export interface SendOutcome {
  providerMsgId: string;
  live: boolean;
}

export class EmailError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable: boolean) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * `OUTREACH_LIVE=false` corta la salida a internet: se devuelve un
 * identificador simulado y el envío queda registrado igual. Así se puede
 * ensayar una campaña entera —supresión, ritmo, plantillas, trazas— sin que
 * salga un solo correo. Es el estado por defecto a propósito.
 */
export async function sendEmail(msg: OutboundEmail): Promise<SendOutcome> {
  if (!config.OUTREACH_LIVE) {
    return { providerMsgId: `dryrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, live: false };
  }

  if (!config.RESEND_API_KEY) {
    throw new EmailError('RESEND_API_KEY no configurada y OUTREACH_LIVE=true', null, false);
  }
  if (!config.OUTREACH_FROM_EMAIL) {
    throw new EmailError('OUTREACH_FROM_EMAIL no configurada', null, false);
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      from: `${config.OUTREACH_FROM_NAME} <${config.OUTREACH_FROM_EMAIL}>`,
      to: [msg.to],
      ...(config.OUTREACH_REPLY_TO ? { reply_to: config.OUTREACH_REPLY_TO } : {}),
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
      headers: {
        'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EmailError(
      `Resend ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      res.status === 429 || res.status >= 500,
    );
  }

  const data = (await res.json()) as { id?: string };
  return { providerMsgId: data.id ?? `resend-${Date.now()}`, live: true };
}

/** Pie obligatorio: origen del dato y baja. Se añade siempre, no se plantilla. */
export function buildFooter(unsubscribeUrl: string, sourceNote: string): string {
  return [
    '',
    '—',
    sourceNote,
    `Si prefiere no recibir más comunicaciones, puede darse de baja aquí: ${unsubscribeUrl}`,
    'La baja es inmediata y no requiere responder a este correo.',
  ].join('\n');
}
