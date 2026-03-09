-- Anti-ban improvements: random delays, daily limits, typing simulation, breaks
-- Replace fixed delay with min/max range for human-like behavior

ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS delay_min_ms INTEGER DEFAULT 8000;
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS delay_max_ms INTEGER DEFAULT 15000;
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS daily_limit_per_session INTEGER DEFAULT 200;
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS typing_simulation BOOLEAN DEFAULT true;
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS break_after_messages INTEGER DEFAULT 25;
ALTER TABLE autopilot_config ADD COLUMN IF NOT EXISTS break_duration_ms INTEGER DEFAULT 60000;

-- Migrate existing delay_between_ms value to delay_min/max (keep old column for compatibility)
UPDATE autopilot_config
SET delay_min_ms = GREATEST(delay_between_ms, 5000),
    delay_max_ms = GREATEST(delay_between_ms * 3, 15000)
WHERE delay_min_ms = 8000 AND delay_max_ms = 15000;

-- Track daily message count per session to enforce limits
CREATE TABLE IF NOT EXISTS session_daily_counts (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);
