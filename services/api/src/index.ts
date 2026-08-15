import Fastify from 'fastify';
import { config, isProd } from './config.js';
import { pool } from './db.js';
import { chatRoutes } from './routes/chat.js';
import { startTelegramPolling } from './channels/telegram.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
    // Nunca registrar cabeceras de autorización ni cuerpos con datos personales.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  // El cuerpo crudo hace falta para verificar firmas HMAC de los webhooks.
  bodyLimit: 2 * 1024 * 1024,
});

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', ts: new Date().toISOString() };
});

await app.register(chatRoutes);

const stopTelegram = await startTelegramPolling(app.log);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando`);
  stopTelegram();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
