-- ═══════════════════════════════════════════════════════════════
-- Trazabilidad del agente (LLMOps) y mensajes proactivos
-- ═══════════════════════════════════════════════════════════════

-- ── Trazas del agente ──────────────────────────────────────────
--
-- `messages` guarda la conversación: lo que dijo el usuario y lo que contestó el
-- bot. No sirve para auditar un agente ReAct, porque entre esos dos mensajes
-- puede haber cinco vueltas de razonamiento y llamadas a herramientas que no
-- deja ver. Cuando un cliente pregunta "¿por qué contestó esto?" o "¿por qué
-- tardó doce segundos?", la respuesta está aquí y en ningún otro sitio.
--
-- Va en tabla aparte y no en columnas de `messages` por dos motivos: son de uno
-- a muchos (un mensaje, N pasos) y tienen un ciclo de vida distinto — las trazas
-- se purgan a los 30-90 días, la conversación se conserva.

CREATE TYPE agent_step_type AS ENUM ('thought', 'tool_call', 'tool_result', 'error');

CREATE TABLE agent_traces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- El mensaje del asistente que cerró el turno. Se rellena al terminar, así
  -- que es NULL mientras el turno está en curso y también si el turno murió a
  -- mitad — un turno con trazas y sin message_id es, por sí solo, una señal.
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  -- Agrupa todos los pasos de una misma llamada a think(). Se genera en el
  -- cliente al empezar el turno: hace falta antes de que exista ninguna fila.
  run_id          UUID NOT NULL,
  iteration       INT NOT NULL,
  step_type       agent_step_type NOT NULL,
  tool_name       TEXT,
  -- El pensamiento del modelo, los argumentos de la llamada o el resultado.
  -- Recortado antes de guardar: una respuesta de 2 MB no aporta más que sus
  -- primeros kilobytes.
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms      INT,
  tokens_used     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconstruir un turno completo en orden. Es la consulta del 90 % de los casos.
CREATE INDEX agent_traces_run_idx ON agent_traces (run_id, iteration, created_at);
-- "Enséñame lo último de esta conversación."
CREATE INDEX agent_traces_conversation_idx ON agent_traces (conversation_id, created_at DESC);
-- "¿Qué herramienta falla más?" Parcial: los pasos sin herramienta son mayoría
-- y no interesan para esta pregunta.
CREATE INDEX agent_traces_tool_idx ON agent_traces (tool_name, created_at DESC)
  WHERE tool_name IS NOT NULL;
-- "¿Qué se rompió esta semana?" Parcial también: los errores son una minoría.
CREATE INDEX agent_traces_errors_idx ON agent_traces (created_at DESC)
  WHERE step_type = 'error';

-- ── Mensajes proactivos ────────────────────────────────────────
--
-- Hasta ahora el bot solo reaccionaba. Con la cola de trabajos puede iniciar
-- conversación: recordar una cita, retomar tras una intervención humana.

-- De dónde salió un mensaje del asistente. Sin esto, un recordatorio automático
-- y una respuesta a una pregunta son indistinguibles en la tabla, y las métricas
-- de "cuánto habla el bot" mezclan cosas que no se parecen.
ALTER TABLE messages ADD COLUMN origin TEXT NOT NULL DEFAULT 'reply'
  CHECK (origin IN ('reply', 'proactive', 'handoff_notice'));

-- Freno de mano contra el spam. El bot puede tener varios disparadores
-- programados para el mismo contacto y encontrarse enviando tres avisos
-- seguidos; esto permite exigir un descanso mínimo entre proactivos.
ALTER TABLE conversations ADD COLUMN last_proactive_at TIMESTAMPTZ;

-- Trazabilidad de los disparadores. BullMQ guarda los trabajos en Redis, que es
-- volátil y se purga: si mañana hay que responder "¿le mandasteis el aviso?",
-- Redis ya no lo sabe. Esto sí.
CREATE TABLE proactive_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE CASCADE,
  -- Id del trabajo en BullMQ. Permite cruzar esta tabla con la cola mientras
  -- el trabajo siga vivo allí.
  queue_job_id     TEXT,
  kind             TEXT NOT NULL CHECK (kind IN ('proactive_message', 'handoff_resolved')),
  context_prompt   TEXT NOT NULL,
  scheduled_for    TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
  -- Por qué no se envió. Los saltos son normales y esperados: conversación
  -- derivada a un humano, ventana de 24 h cerrada, freno anti-spam.
  skip_reason      TEXT,
  last_error       TEXT,
  message_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);
CREATE INDEX proactive_jobs_client_idx ON proactive_jobs (client_id, created_at DESC);
CREATE INDEX proactive_jobs_conversation_idx ON proactive_jobs (conversation_id, created_at DESC);
