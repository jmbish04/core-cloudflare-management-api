-- Migration: Create audit_logs table
-- Created: 2025-11-05

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp TEXT NOT NULL,
    request_ip TEXT,
    request_method TEXT NOT NULL,
    request_url TEXT NOT NULL,
    request_headers TEXT,
    request_body TEXT,
    response_status INTEGER NOT NULL,
    response_body TEXT,
    user_agent TEXT,
    auth_key_used TEXT,
    cloudflare_api_target TEXT,
    duration_ms INTEGER,
    error_message TEXT
);

-- Index for querying by timestamp
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Index for querying by request method
CREATE INDEX IF NOT EXISTS idx_audit_logs_method ON audit_logs(request_method);

-- Index for querying by response status
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(response_status);

-- Index for querying by API target
CREATE INDEX IF NOT EXISTS idx_audit_logs_api_target ON audit_logs(cloudflare_api_target);
