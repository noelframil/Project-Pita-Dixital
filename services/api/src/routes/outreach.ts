import type { FastifyInstance } from 'fastify';
import { unsubscribeByToken } from '../outreach/campaign.js';

/**
 * Baja en un clic.
 *
 * Sin autenticación y a propósito: quien recibe un correo no tiene cuenta ni
 * clave. La seguridad la da el token, que es opaco, aleatorio y distinto por
 * envío — así un enlace filtrado no permite dar de baja a un tercero.
 *
 * Acepta GET (el clic desde el correo) y POST (RFC 8058, la baja en un clic
 * que disparan Gmail y Yahoo desde su propia interfaz). Si solo se implementa
 * GET, el botón nativo del cliente de correo falla en silencio.
 */
export async function outreachRoutes(app: FastifyInstance) {
  const handler = async (request: { params: unknown }, reply: {
    code: (n: number) => { type: (t: string) => { send: (b: string) => unknown } };
  }) => {
    const { token } = request.params as { token: string };
    const result = await unsubscribeByToken(token);

    const page = (title: string, message: string) =>
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title>` +
      `<div style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6">` +
      `<h1 style="font-size:1.3rem">${title}</h1><p>${message}</p></div>`;

    if (!result.ok) {
      return reply.code(404).type('text/html; charset=utf-8').send(
        page('Enlace no válido', 'Este enlace de baja no consta. Si sigue recibiendo correos, responda a cualquiera de ellos y lo resolvemos a mano.'),
      );
    }

    return reply.code(200).type('text/html; charset=utf-8').send(
      page('Baja confirmada', `La dirección <strong>${result.email}</strong> ha sido dada de baja. No recibirá más comunicaciones nuestras.`),
    );
  };

  app.get('/api/v1/outreach/unsubscribe/:token', handler as never);
  app.post('/api/v1/outreach/unsubscribe/:token', handler as never);
}
