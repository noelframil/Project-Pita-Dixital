-- ═══════════════════════════════════════════════════════════════
-- Autocrítica del agente y sistema multi-agente jerárquico
-- ═══════════════════════════════════════════════════════════════

-- ── Autocrítica (self-reflection) ──────────────────────────────
--
-- Antes de enviar, un segundo modelo revisa el borrador contra las reglas del
-- cliente. Cuesta una llamada más por turno, así que va apagada por defecto:
-- es una decisión de producto —¿pesa más la seguridad de marca o la latencia?—
-- y quien la toma es el cliente, no nosotros.

ALTER TABLE bot_configs ADD COLUMN reflection_enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Modelo del crítico. NULL = el mismo del bot. Poner aquí uno más rápido y
-- barato es lo habitual: juzgar un borrador contra unas reglas es bastante más
-- fácil que redactarlo.
ALTER TABLE bot_configs ADD COLUMN reflection_provider TEXT;
ALTER TABLE bot_configs ADD COLUMN reflection_model TEXT;
-- Tope de reescrituras. Dos es lo razonable: si a la tercera sigue sin pasar,
-- el problema está en las reglas del cliente, no en el borrador.
ALTER TABLE bot_configs ADD COLUMN max_reflections INT NOT NULL DEFAULT 2;

-- ── Sub-agentes especialistas ──────────────────────────────────
--
-- Un orquestador que habla con el usuario y delega en especialistas. La razón
-- de existir no es el organigrama: es que un solo prompt con las herramientas
-- de soporte, de ventas y de facturación a la vez se vuelve un prompt mediocre
-- en las tres cosas, y el modelo empieza a coger la herramienta equivocada.

CREATE TABLE sub_agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Identificador que usa el orquestador al delegar. snake_case, como las
  -- herramientas: acaba dentro de un esquema JSON que el modelo debe respetar.
  name         TEXT NOT NULL,
  -- Lo que lee el orquestador para decidir a quién delegar. Es el campo que
  -- determina si la delegación acierta: describe QUÉ le puedes encargar, no
  -- quién es.
  description  TEXT NOT NULL,
  system_prompt TEXT NOT NULL,

  -- Herramientas que ve este especialista, por nombre. Array vacío = ninguna.
  -- Que cada uno vea solo las suyas es media razón de ser del sistema: el de
  -- ventas no debe poder tocar la herramienta de reembolsos.
  tool_names   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- NULL = hereda del bot_config. Un especialista de clasificación puede correr
  -- en un modelo pequeño mientras el orquestador va en uno grande.
  provider     TEXT,
  model        TEXT,
  temperature  REAL,
  max_tokens   INT,
  max_iterations INT NOT NULL DEFAULT 3,

  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name)
);
CREATE INDEX sub_agents_client_idx ON sub_agents (client_id) WHERE is_active;

-- Tope de delegaciones por turno. Sin él, un orquestador indeciso encadena
-- especialistas y un solo mensaje del usuario acaba costando quince llamadas.
ALTER TABLE bot_configs ADD COLUMN max_delegations INT NOT NULL DEFAULT 2;

-- ── Atribución en las trazas ───────────────────────────────────
--
-- Con varios agentes trabajando en un mismo turno, `agent_traces` deja de
-- responder a "¿por qué contestó esto?" si no dice QUIÉN hizo cada paso.

-- 'orchestrator' | 'specialist' | 'critic'
ALTER TABLE agent_traces ADD COLUMN agent_role TEXT NOT NULL DEFAULT 'orchestrator';
-- Nombre del especialista, o NULL en el orquestador.
ALTER TABLE agent_traces ADD COLUMN agent_name TEXT;
-- El turno del orquestador que originó este bucle anidado. Permite reconstruir
-- el árbol completo: quién llamó a quién y en qué orden.
ALTER TABLE agent_traces ADD COLUMN parent_run_id UUID;

CREATE INDEX agent_traces_parent_idx ON agent_traces (parent_run_id)
  WHERE parent_run_id IS NOT NULL;
CREATE INDEX agent_traces_role_idx ON agent_traces (agent_role, created_at DESC);
