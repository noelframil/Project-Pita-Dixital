-- ═══════════════════════════════════════════════════════════════
-- Fase 3 (herramientas) y fase 4 (memoria de contexto)
-- ═══════════════════════════════════════════════════════════════

-- ── Herramientas por cliente ───────────────────────────────────
--
-- Lo que el modelo puede hacer además de hablar. El esquema de entrada se le
-- entrega tal cual al proveedor; la configuración de ejecución (URL, cabeceras,
-- credenciales) va cifrada y el modelo no la ve nunca.

CREATE TABLE tools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- El nombre que ve el modelo. Se valida contra ^[a-z][a-z0-9_]*$ al darla de
  -- alta: los proveedores rechazan otros formatos con un 400 poco explicativo.
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'http' CHECK (kind IN ('http')),
  -- AES-256-GCM con ENCRYPTION_KEY, igual que channel_accounts.credentials.
  -- Una herramienta suele llevar la clave de API de un tercero dentro.
  config       BYTEA NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name)
);
CREATE INDEX tools_client_idx ON tools (client_id) WHERE is_active;

-- Trazabilidad de las llamadas a herramientas. Va aparte de `messages` porque
-- lo que se pregunta de esto son cosas distintas: qué herramienta falla, cuánto
-- tarda, con qué frecuencia se usa. No es el historial de la conversación.
CREATE TABLE tool_invocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_id         UUID REFERENCES tools(id) ON DELETE SET NULL,
  tool_name       TEXT NOT NULL,
  input           JSONB NOT NULL,
  -- Recortado antes de guardar: una respuesta de 2 MB no aporta más que sus
  -- primeros kilobytes y engorda la tabla sin motivo.
  output          TEXT,
  is_error        BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tool_invocations_conversation_idx
  ON tool_invocations (conversation_id, created_at DESC);
CREATE INDEX tool_invocations_name_idx ON tool_invocations (tool_name, created_at DESC);

-- ── Memoria de contexto ────────────────────────────────────────
--
-- El historial se recortaba por número de turnos, que no dice nada del tamaño
-- real: ocho turnos de dos frases y ocho turnos de dos páginas cuestan lo mismo
-- en la cuenta y muy distinto en la factura. Se pasa a presupuesto de tokens.
--
-- Lo que cae fuera del presupuesto no se tira: se resume, y el resumen se
-- acumula en la conversación.

ALTER TABLE conversations ADD COLUMN summary TEXT;
-- Frontera: los mensajes anteriores o iguales a esta marca ya están dentro de
-- `summary` y no se vuelven a cargar. NULL = todavía no se ha resumido nada.
ALTER TABLE conversations ADD COLUMN summarized_until TIMESTAMPTZ;

-- history_turns se conserva como tope duro de mensajes que se leen de la base
-- de datos; el recorte fino lo hace el presupuesto de tokens.
ALTER TABLE bot_configs ADD COLUMN context_token_budget INT NOT NULL DEFAULT 3000;
-- Tope de vueltas del bucle de herramientas dentro de un mismo turno. Sin esto,
-- un modelo que se emperra en reintentar una herramienta rota gasta sin fin.
ALTER TABLE bot_configs ADD COLUMN max_tool_iterations INT NOT NULL DEFAULT 4;
