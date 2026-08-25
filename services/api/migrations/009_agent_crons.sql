-- Fase 11: Subagentes Proactivos (Cron Jobs Cognitivos)

CREATE TABLE agent_crons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  expression TEXT NOT NULL, -- Ej: '0 8 * * *' para las 8:00 AM todos los días
  context_prompt TEXT NOT NULL, -- La misión que tiene el bot
  timezone TEXT DEFAULT 'Europe/Madrid',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ
);

-- Herramienta nativa para que el bot pueda programar sus propios crons
INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'schedule_cron',
  'Programa una tarea recurrente para que tú (el bot) te despiertes a una hora concreta y ejecutes una instrucción. Usa sintaxis cron. Ej: 0 8 * * * (todos los días a las 8am).',
  '{
    "type": "object",
    "properties": {
      "expression": {
        "type": "string",
        "description": "Expresión cron estándar de 5 campos (minuto hora dia mes dia_semana)."
      },
      "contextPrompt": {
        "type": "string",
        "description": "La instrucción clara y detallada que deberás ejecutar cuando te despiertes. Ej: ''Busca noticias de hoy sobre IA y mándame un resumen''."
      }
    },
    "required": ["expression", "contextPrompt"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::jsonb
FROM clients
ON CONFLICT DO NOTHING;
