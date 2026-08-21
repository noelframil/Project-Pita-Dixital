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
const MAILERSEND_ENDPOINT = 'https://api.mailersend.com/v1/email';

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
  if (!config.OUTREACH_FROM_EMAIL) {
    throw new EmailError('OUTREACH_FROM_EMAIL no configurada', null, false);
  }
  return config.OUTREACH_PROVIDER === 'mailersend' ? sendViaMailerSend(msg) : sendViaResend(msg);
}

/**
 * MailerSend. Se usa cuando el dominio ya está autenticado allí: reaprovechar
 * un remitente con SPF y DKIM en marcha evita tocar el DNS del dominio
 * corporativo, que es donde más fácil se rompe el correo de una empresa.
 *
 * Aviso de plan: las cabeceras personalizadas son de Professional en adelante.
 * En planes menores `headers` se ignora o da error, así que se envía sin ellas
 * y la baja viaja en el cuerpo —que `buildFooter` añade siempre—. Peor para la
 * bandeja de entrada, pero nunca deja a alguien sin forma de darse de baja.
 */
async function sendViaMailerSend(msg: OutboundEmail): Promise<SendOutcome> {
  if (!config.MAILERSEND_API_KEY) {
    throw new EmailError('MAILERSEND_API_KEY no configurada y OUTREACH_PROVIDER=mailersend', null, false);
  }

  const body: Record<string, unknown> = {
    from: { email: config.OUTREACH_FROM_EMAIL, name: config.OUTREACH_FROM_NAME },
    to: [{ email: msg.to }],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
  };
  if (config.MAILERSEND_CUSTOM_HEADERS) {
    body.headers = [
      { name: 'List-Unsubscribe', value: `<${msg.unsubscribeUrl}>` },
      { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ];
  }

  const res = await fetch(MAILERSEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.MAILERSEND_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 422 && text.includes('headers')) {
      throw new EmailError(
        'MailerSend rechaza las cabeceras personalizadas: son de plan Professional. ' +
          'Pon MAILERSEND_CUSTOM_HEADERS=false y la baja viajará en el cuerpo.',
        res.status,
        false,
      );
    }
    throw new EmailError(
      `MailerSend ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      res.status === 429 || res.status >= 500,
    );
  }

  // 202 sin cuerpo: el identificador viene en la cabecera.
  const id = res.headers.get('x-message-id') ?? `mailersend-${Date.now()}`;
  return { providerMsgId: id, live: true };
}

async function sendViaResend(msg: OutboundEmail): Promise<SendOutcome> {
  if (!config.RESEND_API_KEY) {
    throw new EmailError('RESEND_API_KEY no configurada y OUTREACH_LIVE=true', null, false);
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
