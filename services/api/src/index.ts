import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { config, isProd } from './config.js';
import { pool } from './db.js';
import { chatRoutes } from './routes/chat.js';
import { startTelegramPolling } from './channels/telegram.js';
import { startHandoffWorker } from './core/handoff.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
    // Nunca registrar cabeceras de autorización ni cuerpos con datos personales.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  // El cuerpo crudo hace falta para verificar firmas HMAC de los webhooks.
  // Solo afecta a cuerpos JSON: lo multipart lo acota el plugin de abajo.
  bodyLimit: 2 * 1024 * 1024,
});

/**
 * Multipart acotado por todos los lados.
 *
 * Cada límite tapa una forma distinta de agotar la memoria del proceso, y
 * quitar cualquiera de ellos deja la puerta abierta:
 *
 *   · `fileSize` es el que todo el mundo pone. Sin él, una sola subida de 2 GB
 *     tumba el proceso.
 *   · `files` evita que alguien mande mil ficheros de 9 MB. El límite por
 *     fichero se cumpliría en cada uno y el proceso moriría igual.
 *   · `fields` y `fieldSize` cierran la misma vía por el lado de los campos de
 *     texto, que no cuentan para `fileSize`.
 *   · `parts` acota el total de partes, incluidas las que no son ni fichero ni
 *     campo con nombre reconocido.
 *
 * `attachFieldsToBody: false` es deliberado: con `true`, el plugin bufferiza
 * todo antes de entregar el control, y el manejador pierde la oportunidad de
 * rechazar por número de adjuntos antes de tenerlos ya en memoria.
 */
await app.register(multipart, {
  attachFieldsToBody: false,
  limits: {
    fileSize: config.MEDIA_MAX_BYTES,
    files: config.MEDIA_MAX_ATTACHMENTS,
    fields: 10,
    fieldSize: config.MAX_MESSAGE_CHARS * 4,
    parts: config.MEDIA_MAX_ATTACHMENTS + 10,
    headerPairs: 100,
  },
});

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', ts: new Date().toISOString() };
});

await app.register(chatRoutes);

const stopTelegram = await startTelegramPolling(app.log);
// Los avisos de handoff no se mandan dentro de la petición del usuario: si el
// servidor del cliente tarda, el usuario se queda esperando. Van por una cola
// con reintentos que trabaja este proceso.
const stopHandoffWorker = startHandoffWorker(app.log);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando`);
  stopTelegram();
  stopHandoffWorker();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
