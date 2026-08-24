ALTER TABLE tools ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_client_status ON pending_actions(client_id, status);

UPDATE tools SET requires_approval = true WHERE name IN ('google_calendar_schedule', 'google_gmail_send');
