import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { think } from '../core/brain.js';
import { sendEmail, buildFooter } from '../outreach/email.js';
import {
  extraerDireccion,
  fetchReceivedEmail,
  limpiarCita,
  verifyResendWebhook,
  type ResendInboundEvent,
} from '../outreach/inbound.js';

/**
 * Webhook de Resend: respuestas, rebotes y quejas.
 *
 * Los tres llegan por el mismo endpoint y se separan por `type`. Merece la pena
 * tenerlos juntos: un rebote es tan informativo como una respuesta, solo que la
 * acción es suprimir en vez de contestar.
 */
export async function inboundRoutes(app: FastifyInstance) {
  app.post('/api/v1/webhooks/resend', async (request, reply) => {
    const rawBody = (request as unknown as { rawBody?: string }).rawBody;
    const secret = config.RESEND_WEBHOOK_SECRET;

    if (!secret) {
      app.log.error('RESEND_WEBHOOK_SECRET sin configurar: se rechaza todo');
      return reply.code(503).send({ error: 'webhook no configurado' });
    }
    if (!rawBody) return reply.code(400).send({ error: 'sin cuerpo' });

    const v = verifyResendWebhook(rawBody, request.headers as Record<string, string>, secret);
    if (!v.ok) {
      app.log.warn({ motivo: v.motivo }, 'webhook de Resend rechazado');
      return reply.code(401).send({ error: 'firma inválida' });
    }

    const event = request.body as ResendInboundEvent;

    // Se responde ya y se procesa después: Resend reintenta si tardamos, y un
    // reintento sobre algo que sí llegó duplica la respuesta al inversor.
    reply.code(200).send({ ok: true });

    procesar(event, app).catch((err) => {
      app.log.error({ err, tipo: event?.type }, 'fallo procesando webhook de Resend');
    });
  });
}

async function procesar(event: ResendInboundEvent, app: FastifyInstance) {
  switch (event.type) {
    case 'email.received':
      return responder(event, app);

    // Un rebote duro y una queja de spam son definitivos: la dirección no se
    // vuelve a tocar. Sin esto la lista se degrada sola y arrastra la
    // reputación del dominio con ella.
    case 'email.bounced':
    case 'email.complained':
      return suprimir(event, app);

    default:
      app.log.debug({ tipo: event.type }, 'evento de Resend ignorado');
  }
}

async function suprimir(event: ResendInboundEvent, app: FastifyInstance) {
  const dest = event.data.to?.[0];
  if (!dest) return;
  const email = extraerDireccion(dest);
  const motivo = event.type === 'email.complained' ? 'complaint' : 'bounce_hard';

  const fila = await queryOne<{ client_id: string }>(
    `SELECT client_id FROM prospects WHERE lower(email)=lower($1) LIMIT 1`,
    [email],
  );
  if (!fila) return;

  await query(
    `INSERT INTO suppression (client_id, email, reason, evidence)
     VALUES ($1,$2,$3,$4) ON CONFLICT (client_id, email) DO NOTHING`,
    [fila.client_id, email, motivo, JSON.stringify({ email_id: event.data.email_id, at: event.created_at })],
  );
  await query(
    `UPDATE prospects SET status='closed' WHERE client_id=$1 AND lower(email)=lower($2)`,
    [fila.client_id, email],
  );
  app.log.warn({ email, motivo }, 'dirección suprimida');
}

async function responder(event: ResendInboundEvent, app: FastifyInstance) {
  const remitente = extraerDireccion(event.data.from);

  // Solo se contesta a quien está en nuestra lista. Cualquiera puede escribir a
  // una dirección del dominio de recepción, y responder a desconocidos con un
  // agente conectado al pipeline es una vía de extracción de información.
  const prospecto = await queryOne<{
    id: string; client_id: string; display_name: string | null;
    organisation: string | null; status: string;
  }>(
    `SELECT id, client_id, display_name, organisation, status
       FROM prospects WHERE lower(email)=lower($1) LIMIT 1`,
    [remitente],
  );
  if (!prospecto) {
    app.log.info({ remitente }, 'correo entrante de alguien que no está en la lista: ignorado');
    return;
  }

  const correo = await fetchReceivedEmail(event.data.email_id);
  const cuerpo = limpiarCita(correo.text ?? '').slice(0, config.MAX_MESSAGE_CHARS);
  if (!cuerpo) {
    app.log.info({ remitente }, 'respuesta sin texto útil');
    return;
  }

  // Una baja pedida en texto libre vale igual que el enlace. Quien escribe
  // "no me escribáis más" ya expresó su voluntad; obligarle a buscar el enlace
  // es la clase de fricción que acaba en queja de spam.
  if (/\b(baja|unsubscribe|no me escrib|dejad de|remove me|stop)\b/i.test(cuerpo)) {
    await query(
      `INSERT INTO suppression (client_id, email, reason, evidence)
       VALUES ($1,$2,'unsubscribe',$3) ON CONFLICT (client_id, email) DO NOTHING`,
      [prospecto.client_id, remitente, JSON.stringify({ texto: cuerpo.slice(0, 200) })],
    );
    await query(`UPDATE prospects SET status='closed' WHERE id=$1`, [prospecto.id]);
    app.log.info({ remitente }, 'baja solicitada por respuesta');
    return;
  }

  const resultado = await think({
    clientId: prospecto.client_id,
    channel: 'email',
    channelUserId: remitente,
    threadRef: remitente,
    message: cuerpo,
    displayName: prospecto.display_name ?? undefined,
  });

  await query(`UPDATE prospects SET status='replied' WHERE id=$1 AND status='active'`, [prospecto.id]);

  if (resultado.handedOff || !resultado.reply) {
    app.log.info({ remitente }, 'derivado a una persona: el agente no responde');
    return;
  }

  const baseUrl = config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`;
  const asunto = correo.subject?.startsWith('Re:') ? correo.subject : `Re: ${correo.subject ?? ''}`;

  await sendEmail({
    to: remitente,
    subject: asunto.trim(),
    text: resultado.reply + buildFooter(`${baseUrl}/api/v1/outreach/unsubscribe/`, 'Conversación iniciada por usted.'),
    unsubscribeUrl: `${baseUrl}/api/v1/outreach/unsubscribe/`,
  });

  app.log.info(
    { remitente, tokens: resultado.usage.totalTokens, latencyMs: resultado.latencyMs },
    'respuesta del agente enviada',
  );
}
