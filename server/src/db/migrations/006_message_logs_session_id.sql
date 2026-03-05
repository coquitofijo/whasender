-- Add session_id to message_logs for per-session metrics
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS session_id UUID;

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_message_logs_session_id ON message_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_sent_at ON message_logs(sent_at);

-- Backfill existing campaign messages (autopilot messages stay NULL — unrecoverable)
UPDATE message_logs ml
SET session_id = c.session_id
FROM campaigns c
WHERE ml.campaign_id = c.id
  AND ml.session_id IS NULL;
