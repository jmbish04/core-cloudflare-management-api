-- Create manage_tokens table to track Cloudflare API tokens and their permissions
-- This table will be kept in sync with Cloudflare API responses during health test runs

CREATE TABLE manage_tokens (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE, -- Cloudflare token ID
  name TEXT, -- Token name/description
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'deleted'
  permissions TEXT, -- JSON array of permissions (e.g., ["Workers Scripts:Read", "Workers Scripts:Edit"])
  policies TEXT, -- JSON array of policies
  issued_on TEXT, -- ISO timestamp when token was issued
  expires_on TEXT, -- ISO timestamp when token expires
  last_verified TEXT NOT NULL, -- ISO timestamp of last verification
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX manage_tokens_token_id_idx ON manage_tokens(token_id);
CREATE INDEX manage_tokens_status_idx ON manage_tokens(status);
CREATE INDEX manage_tokens_last_verified_idx ON manage_tokens(last_verified);
