-- Migration: Create managed_tokens table for token inventory and audit
-- This enables TTL cleanup, 50-token limit management, and audit trail

CREATE TABLE IF NOT EXISTS managed_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    token_name TEXT NOT NULL,
    token_id TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT,
    expires_at TEXT,
    ttl_days INTEGER,
    permissions TEXT NOT NULL, -- JSON array of permissions
    related_resources TEXT, -- JSON object: {worker: "name", zone: "id", etc}
    secret_key TEXT NOT NULL, -- Key in MANAGED_SECRETS where token value is stored
    status TEXT NOT NULL DEFAULT 'active', -- active, expired, revoked
    last_used_at TEXT,
    use_count INTEGER DEFAULT 0,
    metadata TEXT -- JSON for additional context
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_managed_tokens_status ON managed_tokens(status);
CREATE INDEX IF NOT EXISTS idx_managed_tokens_expires_at ON managed_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_managed_tokens_created_at ON managed_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_managed_tokens_purpose ON managed_tokens(purpose);
CREATE INDEX IF NOT EXISTS idx_managed_tokens_token_id ON managed_tokens(token_id);
