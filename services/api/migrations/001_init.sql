-- ═══════════════════════════════════════════════════════════════
-- Project Pita Dixital — esquema inicial del núcleo omnicanal
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Multi-tenencia ─────────────────────────────────────────────

CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La clave nunca se guarda en claro. El prefijo es público y sirve para
-- localizar la fila; el hash es lo único con lo que se verifica.
CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  prefix       TEXT UNIQUE NOT NULL,
  key_hash     TEXT NOT NULL,
  label        TEXT,
  scopes       TEXT[] NOT NULL DEFAULT ARRAY['chat'],
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX api_keys_client_idx ON api_keys (client_id);

-- ── Configuración del bot ──────────────────────────────────────

CREATE TABLE bot_configs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL DEFAULT 'default',
  system_prompt_template TEXT NOT NULL,
  dynamic_variables      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Solo estas variables pueden sobrescribirse desde la petición.
  -- Sin esta lista blanca, el cliente inyecta lo que quiera en el prompt.
  allowed_override_vars  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Ajustes distintos por canal: en SMS conviene ser más seco que en web.
  channel_overrides      JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider               TEXT NOT NULL DEFAULT 'ollama',
  model                  TEXT NOT NULL DEFAULT 'qwen2.5:32b',
  temperature            REAL NOT NULL DEFAULT 0.7,
  max_tokens             INT  NOT NULL DEFAULT 600,
  history_turns          INT  NOT NULL DEFAULT 8,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name)
);

-- Base de conocimiento por cliente (RAG). embedding llega en la fase 2.
CREATE TABLE knowledge_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind        TEXT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  keywords    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX knowledge_client_idx ON knowledge_entries (client_id);
-- Búsqueda de texto completo en español, que es como llegan las preguntas.
CREATE INDEX knowledge_fts_idx ON knowledge_entries
  USING GIN (to_tsvector('spanish', title || ' ' || body));

-- ── Canales ────────────────────────────────────────────────────

CREATE TYPE channel_kind AS ENUM (
  'web','whatsapp','sms','voice','email','telegram',
  'instagram','messenger','youtube','tiktok','linkedin','x'
);

CREATE TABLE channel_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel          channel_kind NOT NULL,
  external_id      TEXT NOT NULL,
  display_name     TEXT,
  -- Cifrado con AES-256-GCM usando ENCRYPTION_KEY. Nunca texto plano.
  credentials      BYTEA NOT NULL,
  token_expires_at TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, external_id)
);
CREATE INDEX channel_accounts_client_idx ON channel_accounts (client_id, channel);

-- ── Identidad: una persona, muchos canales ─────────────────────

CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  display_name TEXT,
  locale       TEXT NOT NULL DEFAULT 'es-ES',
  attributes   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel         channel_kind NOT NULL,
  channel_user_id TEXT NOT NULL,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, channel_user_id)
);

-- ── Conversaciones y mensajes ──────────────────────────────────

CREATE TABLE conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel_account_id UUID REFERENCES channel_accounts(id) ON DELETE SET NULL,
  channel            channel_kind NOT NULL,
  thread_ref         TEXT NOT NULL,
  -- open: el bot responde. handoff: se calla, contesta una persona.
  status             TEXT NOT NULL DEFAULT 'open',
  window_expires_at  TIMESTAMPTZ,
  last_message_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, channel, thread_ref)
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool','agent')),
  text              TEXT,
  media             JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_msg_id   TEXT,
  model             TEXT,
  tokens_prompt     INT,
  tokens_completion INT,
  cost_micros       BIGINT,
  latency_ms        INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotencia de webhooks: Meta y Twilio reintentan. Sin esto el bot
-- responde dos y tres veces al mismo mensaje.
CREATE UNIQUE INDEX messages_provider_msg_id_idx
  ON messages (provider_msg_id) WHERE provider_msg_id IS NOT NULL;
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC);

-- ── Consentimiento (RGPD) ──────────────────────────────────────

CREATE TABLE consents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  granted    BOOLEAN NOT NULL,
  evidence   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
