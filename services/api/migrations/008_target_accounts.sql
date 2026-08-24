-- Cuentas objetivo: el paso previo a los contactos nominales.
--
-- En originación de operaciones la lista de cuentas ya vale por sí sola: saber
-- QUÉ fondos de farmland operan en Iberia es trabajo hecho, aunque los nombres
-- de sus directores lleguen después.
CREATE TABLE target_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  apollo_id   TEXT,
  name        TEXT NOT NULL,
  domain      TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  industry    TEXT,
  keywords    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  employees   INT,
  revenue     BIGINT,
  founded_year INT,
  city        TEXT,
  state       TEXT,
  country     TEXT,
  segments    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source      TEXT NOT NULL DEFAULT 'apollo',
  -- pending → qualified → discarded. Lo decide una persona mirando la lista.
  status      TEXT NOT NULL DEFAULT 'pending',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, apollo_id)
);
CREATE INDEX target_accounts_segments_idx ON target_accounts USING GIN (segments);
CREATE INDEX target_accounts_client_status_idx ON target_accounts (client_id, status);
