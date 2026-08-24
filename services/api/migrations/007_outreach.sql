-- ═══════════════════════════════════════════════════════════════
-- Captación por email: prospectos, campañas, supresión y envíos
-- ═══════════════════════════════════════════════════════════════

-- ── Lista de supresión ─────────────────────────────────────────
--
-- La tabla más importante del módulo. Se consulta antes de CADA envío y
-- no se borra nunca de ella. Una baja que se ignora una sola vez cuesta la
-- reputación del dominio, y recuperarla lleva meses.
--
-- Es global al cliente, no por campaña: quien pide no recibir nada no quiere
-- decir "de esta campaña".
CREATE TABLE suppression (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  -- unsubscribe | bounce_hard | complaint | manual
  reason     TEXT NOT NULL,
  evidence   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, email)
);

-- ── Prospectos ─────────────────────────────────────────────────
--
-- Separado de `contacts` a propósito: un prospecto es alguien a quien
-- queremos escribir; un contacto es alguien con quien ya hablamos. Tienen
-- ciclos de vida y bases legales distintas. Cuando un prospecto responde,
-- el adaptador lo resuelve a `contacts` como cualquier otro canal.
CREATE TABLE prospects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT,
  organisation  TEXT,
  role_title    TEXT,
  locale        TEXT NOT NULL DEFAULT 'es',
  -- Vertical de interés declarado; alimenta la segmentación.
  segments      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- De dónde salió este contacto y con qué base legal se le escribe.
  -- Sin esto no se puede responder a un derecho de acceso, y es lo primero
  -- que pregunta una autoridad de protección de datos.
  source        TEXT NOT NULL,
  legal_basis   TEXT NOT NULL DEFAULT 'legitimate_interest',
  consent_at    TIMESTAMPTZ,

  attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | replied | closed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, email)
);
CREATE INDEX prospects_segments_idx ON prospects USING GIN (segments);

-- ── Campañas ───────────────────────────────────────────────────
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  segment      TEXT,
  subject      TEXT NOT NULL,
  body_template TEXT NOT NULL,
  from_name    TEXT NOT NULL,
  from_email   TEXT NOT NULL,
  reply_to     TEXT,

  -- draft → approved → sending → sent. Nada sale en 'draft': una persona
  -- aprueba el texto antes de que salga a nombre de la firma.
  status       TEXT NOT NULL DEFAULT 'draft',
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name)
);

CREATE TABLE campaign_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id   UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed|skipped
  skip_reason   TEXT,
  provider_msg_id TEXT,
  -- Token de baja: va en la URL y en List-Unsubscribe. Opaco y por envío,
  -- para que un enlace filtrado no permita dar de baja a terceros.
  unsub_token   TEXT NOT NULL,
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una campaña escribe a cada prospecto una sola vez. El reintento no duplica.
  UNIQUE (campaign_id, prospect_id)
);
CREATE UNIQUE INDEX campaign_sends_unsub_token_idx ON campaign_sends (unsub_token);
CREATE INDEX campaign_sends_status_idx ON campaign_sends (campaign_id, status);
