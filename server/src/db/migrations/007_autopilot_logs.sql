-- Persistent autopilot logs
CREATE TABLE IF NOT EXISTS autopilot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'info',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: index for efficient deletion of old logs
CREATE INDEX IF NOT EXISTS idx_autopilot_logs_created_at ON autopilot_logs(created_at);
