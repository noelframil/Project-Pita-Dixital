import { query, queryOne } from '../db.js';
import { complete } from '../llm/index.js';
import { config } from '../config.js';

/**
 * Lóbulo Frontal: Capacidad de Auto-Aprendizaje.
 * Lee una conversación fallida o completada y extrae una regla de comportamiento
 * que inyecta en el prompt del sistema permanentemente.
 */
export async function learnFromConversation(conversationId: string, clientId: string) {
  const messages = await query<any>(
    `SELECT role, text FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );

  if (messages.length < 4) return; // No hay suficiente contexto para aprender

  const transcript = messages.map((m: any) => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

  const systemCritique = `
Eres el Lóbulo Frontal de una Inteligencia Artificial General.
Tu trabajo es leer una conversación pasada entre tu yo anterior (ASSISTANT) y un humano (USER), e identificar un fallo de comportamiento, tono, o procedimiento.
Si detectas un error claro (ej. el usuario se frustró, tuviste que escalar a un humano por no saber hacer algo, o repetiste información), debes extraer UNA regla estricta de 1 o 2 líneas para que nunca vuelva a pasar.

Formato de salida:
Si no hay nada grave que aprender, responde: NONE
Si hay una lección clara, responde exactamente con la regla a añadir. Ejemplo: "REGLA APRENDIDA: Nunca pidas el correo electrónico dos veces si ya está en la memoria semántica."
`;

  try {
    const analysis = await complete('openai', {
      model: 'gpt-4o-mini',
      system: systemCritique,
      messages: [{ role: 'user', content: transcript }],
      temperature: 0.1,
      maxTokens: 200
    });

    const rule = analysis.text.trim();

    if (rule !== 'NONE' && rule.includes('REGLA APRENDIDA')) {
      const cleanRule = rule.replace('REGLA APRENDIDA:', '').trim();
      
      // Inyectar en el prompt base
      const currentConfig = await queryOne<any>(
        `SELECT system_prompt_template FROM bot_configs WHERE client_id = $1`,
        [clientId]
      );

      if (currentConfig) {
        // Evitar inyectar la misma regla mil veces
        if (!currentConfig.system_prompt_template.includes(cleanRule)) {
            const newPrompt = currentConfig.system_prompt_template + `\n\n[REGLA APRENDIDA AUTOMÁTICAMENTE]: ${cleanRule}`;
            
            await query(
            `UPDATE bot_configs SET system_prompt_template = $1 WHERE client_id = $2`,
            [newPrompt, clientId]
            );

            console.log(`🧠 [Lóbulo Frontal] Nueva regla inyectada para el cliente ${clientId}: ${cleanRule}`);
        }
      }
    }
  } catch (err) {
    console.error('Error en Auto-Aprendizaje:', err);
  }
}
