/**
 * Correo entrante de Resend.
 *
 * Cierra el círculo de la captación: hasta ahora el sistema escribía y las
 * respuestas se perdían en una bandeja. Con esto la respuesta de un inversor
 * vuelve al agente, que ya sabe cualificarlo y mantener el documento ciego.
 *
 * El webhook trae solo metadatos —ni cuerpo ni adjuntos— porque un adjunto
 * grande no cabe en el cuerpo de una petición serverless. El contenido se pide
 * aparte con el identificador que llega en el evento.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export interface ResendInboundEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    message_id?: string;
    received_for?: string[];
  };
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  headers: Record<string, string>;
}

/**
 * Verificación de firma (formato svix, el que usa Resend).
 *
 * Se firma `id.timestamp.payload` con el secreto en base64 tras el prefijo
 * `whsec_`. La cabecera puede traer varias firmas separadas por espacio
 * —durante una rotación de secreto conviven la vieja y la nueva—, así que hay
 * que aceptar si CUALQUIERA cuadra; comparar solo la primera rompe los envíos
 * justo mientras se rota.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
  secret: string,
): { ok: boolean; motivo?: string } {
  const id = headers['svix-id'] ?? headers['webhook-id'];
  const ts = headers['svix-timestamp'] ?? headers['webhook-timestamp'];
  const sigHeader = headers['svix-signature'] ?? headers['webhook-signature'];

  if (!id || !ts || !sigHeader) return { ok: false, motivo: 'faltan cabeceras de firma' };

  // Ventana temporal: sin ella, una petición capturada vale para siempre.
  const edadSegundos = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(edadSegundos) || edadSegundos > 300) {
    return { ok: false, motivo: 'marca de tiempo fuera de ventana (5 min)' };
  }

  const clave = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const esperada = createHmac('sha256', clave).update(`${id}.${ts}.${rawBody}`).digest('base64');

  const recibidas = sigHeader
    .split(' ')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('v1,'))
    .map((p) => p.slice(3));

  if (recibidas.length === 0) return { ok: false, motivo: 'sin firmas v1 en la cabecera' };

  const b = Buffer.from(esperada);
  const cuadra = recibidas.some((r) => {
    const a = Buffer.from(r);
    // Igual que en el webhook de WhatsApp: timingSafeEqual lanza si las
    // longitudes difieren, así que se comprueba antes.
    return a.length === b.length && timingSafeEqual(a, b);
  });

  return cuadra ? { ok: true } : { ok: false, motivo: 'firma no coincide' };
}

/** Pide el contenido del correo, que el webhook no incluye. */
export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada');

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status} al recuperar el correo ${emailId}`);
  }
  const d = (await res.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.length ? v : null);

  return {
    id: String(d.id ?? emailId),
    from: String(d.from ?? ''),
    to: Array.isArray(d.to) ? (d.to as string[]) : [],
    subject: str(d.subject),
    text: str(d.text),
    html: str(d.html),
    messageId: str(d.message_id),
    headers: (d.headers as Record<string, string>) ?? {},
  };
}

/** `Nombre Apellido <a@b.com>` → `a@b.com` */
export function extraerDireccion(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m?.[1] ?? from).trim().toLowerCase();
}

/**
 * Quita la cita del correo anterior.
 *
 * Sin esto, cada respuesta arrastra todo el hilo y el agente acaba
 * respondiendo a su propio mensaje anterior en vez de a lo nuevo. Los cortes
 * cubren los clientes de correo más comunes en español e inglés.
 */
export function limpiarCita(texto: string): string {
  const cortes = [
    /^\s*El .+ escribió:\s*$/im,
    /^\s*On .+ wrote:\s*$/im,
    /^\s*-{2,}\s*Mensaje original\s*-{2,}\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*De:\s.+$/im,
    /^\s*From:\s.+$/im,
    /^_{10,}\s*$/m,
  ];
  let fin = texto.length;
  for (const re of cortes) {
    const m = re.exec(texto);
    if (m && m.index < fin) fin = m.index;
  }
  return texto
    .slice(0, fin)
    // Líneas citadas sueltas que queden por encima del corte.
    .split('\n')
    .filter((l) => !/^\s*>/.test(l))
    .join('\n')
    .trim();
}
