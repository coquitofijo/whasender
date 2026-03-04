CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_auth_creds (
    session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    creds JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS session_auth_keys (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    key_type VARCHAR(50) NOT NULL,
    key_id VARCHAR(255) NOT NULL,
    key_data JSONB NOT NULL,
    PRIMARY KEY (session_id, key_type, key_id)
);

CREATE TABLE IF NOT EXISTS contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(200),
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE RESTRICT,
    message_template TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    delay_min_ms INTEGER NOT NULL DEFAULT 3000,
    delay_max_ms INTEGER NOT NULL DEFAULT 4000,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    contact_phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    wa_message_id VARCHAR(100),
    sent_at TIMESTAMPTZ DEFAULT NOW()
);
