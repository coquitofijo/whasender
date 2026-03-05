-- Ban alerts: persistent pinned log when a session gets banned
CREATE TABLE IF NOT EXISTS ban_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    session_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    reason VARCHAR(50) NOT NULL DEFAULT 'banned',
    status_code INTEGER,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow message_logs.campaign_id to be NULL (autopilot messages have no campaign)
ALTER TABLE message_logs ALTER COLUMN campaign_id DROP NOT NULL;
