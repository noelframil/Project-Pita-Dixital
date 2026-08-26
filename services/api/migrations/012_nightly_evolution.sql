-- Sección H: Evolución Autónoma nocturna
-- Registros para consolidación semántica y auditoría de mantenimiento.

CREATE TABLE IF NOT EXISTS nightly_jobs (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- running, success, error
  records_processed INTEGER DEFAULT 0,
  error_log TEXT
);

CREATE INDEX IF NOT EXISTS idx_nightly_jobs_name_status ON nightly_jobs(job_name, status);
