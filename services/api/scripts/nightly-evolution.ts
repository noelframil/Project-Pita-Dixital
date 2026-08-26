import { query, queryOne, withAdvisoryLock } from '../src/db.js';
import { config } from '../src/config.js';
import { complete } from '../src/llm/index.js';
import { loadTools } from '../src/core/tools.js';

const JOB_NAME = 'nightly-evolution';

async function main() {
  console.log('🚀 Iniciando Evolución Nocturna (God Mode / Mejora Continua)...');

  // 1. Marcar inicio del Job
  const jobRecord = await queryOne<{ id: number }>(
    `INSERT INTO nightly_jobs (job_name, status) VALUES ($1, 'running') RETURNING id`,
    [JOB_NAME]
  );
  const jobId = jobRecord!.id;

  try {
    // 2. Extraer todos los errores de herramientas de las últimas 24 horas
    const errors = await query<{
      id: string;
      tool_name: string;
      input: any;
      output: string;
      client_id: string;
    }>(
      `SELECT i.id, i.tool_name, i.input, i.output, c.conversation_id, c.client_id
       FROM tool_invocations i
       JOIN (SELECT DISTINCT id as conversation_id, client_id FROM conversations) c ON i.conversation_id = c.conversation_id
       WHERE i.is_error = true 
         AND i.created_at >= NOW() - INTERVAL '24 hours'`
    );

    if (errors.length === 0) {
      console.log('✨ No se encontraron errores en las últimas 24 horas. Todo perfecto.');
      await query(
        `UPDATE nightly_jobs SET status = 'success', completed_at = NOW(), records_processed = 0 WHERE id = $1`,
        [jobId]
      );
      process.exit(0);
    }

    console.log(`🔍 Se encontraron ${errors.length} errores. Analizando con LLM...`);

    // 3. Agrupar errores por tool y cliente (para no saturar el prompt con lo mismo)
    const grouped = errors.reduce((acc, curr) => {
      const key = `${curr.client_id}::${curr.tool_name}`;
      if (!acc[key]) acc[key] = [];
      if (acc[key].length < 5) acc[key].push(curr); // max 5 examples per tool per client
      return acc;
    }, {} as Record<string, typeof errors>);

    let processed = 0;
    for (const [key, examples] of Object.entries(grouped)) {
      const [clientId, toolName] = key.split('::');
      console.log(`➡️ Analizando fallos de [${toolName}] para el cliente [${clientId}]`);

      const tools = await loadTools(clientId!);
      const targetTool = tools.find(t => t.name === toolName);

      const prompt = `
Eres el Ingeniero de Mantenimiento Nocturno de una IA sin límites. 
Tu objetivo es analizar los fallos de las herramientas ocurridos hoy y determinar cómo arreglarlos definitivamente.

Herramienta que falló: ${toolName}
Tipo de herramienta: ${targetTool ? targetTool.kind : 'desconocida/borrada'}
Esquema: ${targetTool ? JSON.stringify(targetTool.inputSchema) : 'N/A'}

Ejemplos de errores (últimas 24h):
${examples.map(e => `- Input: ${JSON.stringify(e.input)}\n  Output/Error: ${e.output}`).join('\n\n')}

TAREA:
Genera un análisis breve. Si la herramienta es de tipo 'custom_script', genera el nuevo código JavaScript corregido para que no vuelva a fallar. Devuelve tu respuesta en JSON:
{
  "analisis": "...",
  "solucion_propuesta": "...",
  "nuevo_script_code": "(solo si aplica, el código JS corregido, si no null)",
  "nuevo_user_fact": "(solo si aplica, una regla para guardar en memoria y evitar que el agente use mal la herramienta, si no null)"
}
`;

      const result = await complete(config.DEFAULT_LLM_PROVIDER, {
        model: config.DEFAULT_LLM_MODEL,
        system: 'Eres un ingeniero experto en auto-reparación de agentes.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 2000,
      });

      try {
        const rawText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);
        console.log(`\n💡 Análisis para ${toolName}: ${parsed.analisis}`);
        console.log(`🛠️ Solución: ${parsed.solucion_propuesta}`);

        if (parsed.nuevo_script_code && targetTool?.kind === 'custom_script') {
          await query(
            `UPDATE tools SET script_code = $1 WHERE client_id = $2 AND name = $3`,
            [parsed.nuevo_script_code, clientId, toolName]
          );
          console.log(`✅ Herramienta ${toolName} actualizada (auto-reparada).`);
        }

        if (parsed.nuevo_user_fact) {
          console.log(`🧠 Nuevo conocimiento aprendido: ${parsed.nuevo_user_fact}`);
          // TODO: En un sistema completo, insertar esto en la tabla user_facts o bot_configs.
        }

        processed += examples.length;
      } catch (err) {
        console.error(`❌ Fallo al parsear la respuesta del LLM para ${key}:`, err);
      }
    }

    // 4. Marcar completado
    await query(
      `UPDATE nightly_jobs SET status = 'success', completed_at = NOW(), records_processed = $2 WHERE id = $1`,
      [jobId, processed]
    );

    console.log(`\n🎉 Evolución Nocturna completada. Se procesaron ${processed} errores.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error fatal en Evolución Nocturna:', err);
    await query(
      `UPDATE nightly_jobs SET status = 'error', completed_at = NOW(), error_log = $2 WHERE id = $1`,
      [jobId, err instanceof Error ? err.stack : String(err)]
    );
    process.exit(1);
  }
}

main();
