-- ═══════════════════════════════════════════════════════════════
-- Memoria semántica: hechos que el bot recuerda de cada persona
-- ═══════════════════════════════════════════════════════════════
--
-- La memoria de conversación (`conversations.summary`) se comprime y se olvida:
-- resume una conversación y solo esa. Esto es otra cosa — hechos que siguen
-- siendo ciertos dentro de seis meses, en otro canal y en otra conversación.
-- "Me llamo Carlos" y "ya probé el plan básico" no caducan cuando cierra la
-- sesión.
--
-- ── Sobre el identificador de usuario ──────────────────────────
--
-- La especificación pedía un `user_identifier` (teléfono, id de usuario final)
-- distinto del `session_id` temporal. Ese identificador **ya existe** en este
-- esquema: es `contacts.id`. La tabla `contacts` junto con `contact_identities`
-- resuelve exactamente ese problema desde el esquema inicial — la misma persona
-- escribiendo por WhatsApp el martes y por Instagram el jueves converge en un
-- único contacto.
--
-- Guardar además el teléfono en texto sería peor: un contacto tiene VARIAS
-- identidades (un número, un id de Telegram, un correo), así que "el
-- identificador" en singular no existe, y duplicarlo abriría la puerta a que la
-- memoria de una persona quedara partida entre dos claves.

CREATE TYPE fact_category AS ENUM ('preference', 'personal_detail', 'business_context');

CREATE TABLE user_facts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- El usuario final, estable entre canales y entre conversaciones.
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Clave normalizada del hecho: 'nombre', 'idioma_preferido', 'plan_actual'.
  -- No estaba en la especificación y hace falta: sin ella, cada vez que alguien
  -- dice su nombre se guarda una fila nueva, y a los tres meses el bloque de
  -- memoria son cuarenta variaciones de lo mismo compitiendo por sitio en el
  -- prompt. Con clave, un hecho que cambia SUSTITUYE al anterior.
  fact_key      TEXT NOT NULL,
  fact_category fact_category NOT NULL,
  fact_value    TEXT NOT NULL,

  -- 0..1. Lo estima el modelo al capturarlo: no es lo mismo "me llamo Carlos"
  -- que deducir el nombre de una firma de correo. Sirve para ordenar cuando hay
  -- más hechos que sitio, y para no inyectar conjeturas como si fueran datos.
  confidence_score REAL NOT NULL DEFAULT 0.8
    CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- De dónde salió. Sin esto, un hecho equivocado no se puede rastrear hasta la
  -- conversación que lo generó, que es lo primero que se pregunta al verlo.
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un hecho por clave y persona. Es lo que convierte el guardado en un UPSERT
  -- y hace que "en realidad me llamo Carlos Manuel" corrija en vez de acumular.
  UNIQUE (contact_id, fact_key)
);

-- La consulta de cada turno: los hechos de esta persona, los más fiables
-- primero. El índice la cubre entera.
CREATE INDEX user_facts_lookup_idx
  ON user_facts (contact_id, confidence_score DESC, updated_at DESC);
-- Para el borrado por cliente y para el ejercicio del derecho de supresión.
CREATE INDEX user_facts_client_idx ON user_facts (client_id, updated_at DESC);

-- Historial de cambios de un hecho.
--
-- Un hecho que cambia machaca al anterior, y a veces machaca mal: el modelo
-- entiende torcido una frase y sustituye un dato bueno por uno malo. Sin
-- historial, ese dato bueno no se puede recuperar ni se puede saber cuándo se
-- perdió.
CREATE TABLE user_fact_revisions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id        UUID NOT NULL REFERENCES user_facts(id) ON DELETE CASCADE,
  previous_value TEXT NOT NULL,
  new_value      TEXT NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL
);
CREATE INDEX user_fact_revisions_fact_idx ON user_fact_revisions (fact_id, changed_at DESC);

-- Interruptor por cliente. La memoria de largo plazo es una decisión de
-- producto y de privacidad, no solo técnica: hay clientes que no quieren que su
-- bot recuerde nada entre conversaciones, y tiene que poder apagarse.
ALTER TABLE bot_configs ADD COLUMN memory_enabled BOOLEAN NOT NULL DEFAULT TRUE;
-- Cuántos hechos como mucho entran en el prompt. Sin tope, un cliente
-- veterano con doscientos hechos se come el presupuesto de contexto.
ALTER TABLE bot_configs ADD COLUMN memory_max_facts INT NOT NULL DEFAULT 20;
