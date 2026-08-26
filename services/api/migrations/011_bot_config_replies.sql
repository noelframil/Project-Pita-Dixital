ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS fallback_reply TEXT NOT NULL DEFAULT '¡Ups! Algo no ha ido bien. ¿Puedes repetírmelo de otra manera?';
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS handoff_user_reply TEXT NOT NULL DEFAULT 'He avisado a un compañero para que revise esto. Te contestará lo antes posible.';
