-- Multiple rotating templates for autopilot
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS message_templates JSONB NOT NULL DEFAULT '[]';

-- Proxy support per session
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS proxy_url VARCHAR(500);
