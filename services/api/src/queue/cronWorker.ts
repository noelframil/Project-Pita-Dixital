import * as cronParser from 'cron-parser';
import type { FastifyBaseLogger } from 'fastify';
import { query } from '../db.js';
import { think } from '../core/brain.js';
import { sendToConversation } from '../channels/outbound.js';

interface AgentCron {
  id: string;
  client_id: string;
  expression: string;
  context_prompt: string;
  timezone: string;
  last_run_at: Date | null;
}

export function startCronWorker(log: FastifyBaseLogger): () => void {
  log.info('Worker de Cron Jobs Cognitivos iniciado');

  let isRunning = false;

  const interval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processCrons(log);
    } catch (err) {
      log.error({ err }, 'Error en el worker de crons');
    } finally {
      isRunning = false;
    }
  }, 60 * 1000); // Check every minute

  return () => clearInterval(interval);
}

async function processCrons(log: FastifyBaseLogger): Promise<void> {
  const crons = await query<AgentCron>(
    `SELECT * FROM agent_crons WHERE active = true`
  );

  const now = new Date();

  for (const cron of crons) {
    try {
      // @ts-ignore
      const interval = cronParser.parseExpression(cron.expression, {
        tz: cron.timezone,
        currentDate: cron.last_run_at ?? new Date(now.getTime() - 60000),
      });

      const nextRun = interval.next().toDate();

      // Si el próximo run ya pasó o es ahora mismo (margen de 1 minuto)
      if (nextRun.getTime() <= now.getTime()) {
        log.info({ cronId: cron.id }, 'Ejecutando cron cognitivo');
        
        // Actualizamos last_run_at antes de ejecutar para evitar reentradas
        await query(`UPDATE agent_crons SET last_run_at = NOW() WHERE id = $1`, [cron.id]);

        // Ejecutamos el agente de forma autónoma simulando un mensaje del sistema
        // El hilo será con el propio administrador (un threadRef especial 'system_cron')
        const result = await think({
          clientId: cron.client_id,
          channel: 'whatsapp',
          channelUserId: 'system_cron_admin', // Debería mapearse al admin, usamos este ID interno
          threadRef: 'cron_' + cron.id,
          message: `[CRON SISTEMA]: ${cron.context_prompt}`,
          displayName: 'Sistema (Cron)',
        });

        if (result.reply && !result.handedOff) {
          // Si el bot quiso contestar algo al respecto del cron, lo enviamos
          await sendToConversation(result.conversationId, result.reply).catch((e) => 
             log.error('Fallo al enviar respuesta del cron', e)
          );
        }
      }
    } catch (err) {
      log.error({ cronId: cron.id, err }, 'Fallo al parsear o ejecutar cron');
    }
  }
}
