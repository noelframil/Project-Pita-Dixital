import { query } from '../db.js';
import { complete } from '../llm/index.js';
import { composeProactiveMessage } from '../core/proactive.js';
import { config } from '../config.js';

/**
 * Monitor Predictivo de Proactividad
 * Se ejecuta cíclicamente para analizar métricas y decidir de forma autónoma si el bot debe interrumpir al usuario.
 */
export class ProactiveMonitor {
  private intervalId?: NodeJS.Timeout;

  start() {
    // En un entorno real esto sería cron o bullmq cada 1h, aquí lo haremos cada 60s para demo.
    this.intervalId = setInterval(() => this.runPredictiveLoop(), 60000);
    console.log('[ProactiveMonitor] Motor predictivo de proactividad iniciado (Polling 60s).');
    // Run immediately once to test
    setTimeout(() => this.runPredictiveLoop(), 5000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async runPredictiveLoop() {
    try {
      console.log('[ProactiveMonitor] Analizando métricas del sistema...');
      
      // 1. Recopilar estado del mundo (Métricas simuladas para la demo)
      const kpis = {
        sales_last_24h: 1200,
        sales_target: 5000,
        server_cpu_usage: 85,
        active_users: 320,
        support_tickets_open: 42,
        time_since_last_user_message: '4 hours'
      };

      // 2. Motor de Inferencia (LLM)
      const prompt = `
Eres el núcleo predictivo de un Agente AGI. Analiza estas métricas de negocio y de sistema:
${JSON.stringify(kpis, null, 2)}

¿Hay algo crítico, sugerencia de valor, o anomalía que justifique que inicies una conversación proactiva con el administrador?
Responde en formato JSON estricto con este esquema:
{
  "requires_alert": boolean,
  "context_prompt": "Instrucción breve de lo que el bot debe redactar (ej: 'Avisa de que las ventas están bajas y sugiere una promoción')",
  "reasoning": "Breve explicación para los logs"
}
Si todo está normal, requires_alert debe ser false.`;

      const result = await complete('openai', {
        model: 'gpt-4o-mini',
        system: 'Eres un sistema de monitoreo experto. Devuelve SOLO JSON válido.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 500,
      });

      const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
      
      if (parsed.requires_alert && parsed.context_prompt) {
        console.log(`[ProactiveMonitor] ALERTA DETECTADA: ${parsed.reasoning}`);
        await this.triggerProactiveMessage(parsed.context_prompt);
      } else {
        console.log(`[ProactiveMonitor] Todo normal. No se requiere interrupción.`);
      }
    } catch (error) {
      console.error('[ProactiveMonitor] Error en el loop predictivo:', error);
    }
  }

  private async triggerProactiveMessage(contextPrompt: string) {
    try {
      // Seleccionar una conversación activa en el sandbox para inyectar el mensaje.
      // En producción iteraríamos sobre los administradores activos o canales habilitados.
      const rows = await query<{ client_id: string, thread_ref: string, channel: any }>(`
        SELECT client_id, thread_ref, channel 
        FROM conversations 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      if (rows.length === 0) return;
      const target = rows[0];

      console.log(`[ProactiveMonitor] Disparando mensaje proactivo a la conversación...`);
      const outcome = await composeProactiveMessage({
        clientId: target.client_id,
        sessionId: target.thread_ref,
        channel: target.channel,
        contextPrompt
      });

      if (outcome.sent) {
        console.log(`[ProactiveMonitor] Mensaje proactivo inyectado con éxito en BD.`);
        // TODO: Signal frontend via websocket to refresh (if not polling)
      } else {
        console.log(`[ProactiveMonitor] Mensaje omitido por reglas de proactividad: ${outcome.skipReason}`);
      }
    } catch (e) {
      console.error('[ProactiveMonitor] Fallo al disparar mensaje:', e);
    }
  }
}
