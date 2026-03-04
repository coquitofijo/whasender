-- Autopilot config (single row)
CREATE TABLE IF NOT EXISTS autopilot_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_template TEXT NOT NULL DEFAULT '',
    messages_per_cycle INT NOT NULL DEFAULT 20,
    cycle_interval_hours NUMERIC NOT NULL DEFAULT 4,
    delay_between_ms INT NOT NULL DEFAULT 3000,
    status VARCHAR(20) NOT NULL DEFAULT 'stopped',
    last_cycle_at TIMESTAMPTZ,
    next_cycle_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session-to-list assignments for autopilot
CREATE TABLE IF NOT EXISTS autopilot_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
    UNIQUE(session_id)
);

-- Allow message_logs without a campaign (for autopilot messages)
ALTER TABLE message_logs ALTER COLUMN campaign_id DROP NOT NULL;

-- Track which contact was last sent to in each list (for autopilot resume)
CREATE INDEX IF NOT EXISTS idx_message_logs_contact_id ON message_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON message_logs(status);
