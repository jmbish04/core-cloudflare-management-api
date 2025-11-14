-- Create comprehensive logging system for tracking all application actions
-- Sessions table tracks each request/session, actions_log tracks every action within sessions

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE, -- UUID for the session
  request_type TEXT NOT NULL, -- 'api', 'cron', 'health_check', 'test', etc.
  request_method TEXT, -- HTTP method (GET, POST, etc.) for API requests
  request_path TEXT, -- Request path for API requests
  request_headers TEXT, -- JSON string of request headers
  request_body TEXT, -- Request body (truncated if too large)
  user_agent TEXT, -- User agent string
  client_ip TEXT, -- Client IP address
  account_id TEXT, -- Cloudflare account ID if applicable
  user_id TEXT, -- User identifier if authenticated
  started_at TEXT NOT NULL, -- ISO timestamp when session started
  completed_at TEXT, -- ISO timestamp when session completed
  duration_ms INTEGER, -- Total duration in milliseconds
  status_code INTEGER, -- HTTP status code returned
  response_size INTEGER, -- Response size in bytes
  error_message TEXT, -- Error message if session failed
  metadata TEXT, -- JSON string for additional session data
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Actions log table - records every single action within a session
CREATE TABLE actions_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL, -- FK to sessions.session_id
  action_type TEXT NOT NULL, -- 'request_received', 'api_call', 'ai_request', 'ai_response', 'cloudflare_api_call', 'cloudflare_api_response', 'database_query', 'response_sent', 'error', etc.
  action_name TEXT NOT NULL, -- Descriptive name of the action
  timestamp TEXT NOT NULL, -- ISO timestamp when action occurred
  duration_ms INTEGER, -- How long this action took (if applicable)
  status TEXT NOT NULL, -- 'started', 'completed', 'failed', 'info'
  input_data TEXT, -- JSON string of input data (request body, API params, etc.)
  output_data TEXT, -- JSON string of output data (response, results, etc.)
  error_message TEXT, -- Error details if action failed
  metadata TEXT, -- JSON string for additional action data
  sequence_number INTEGER NOT NULL, -- Order of actions within session
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key constraint
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX sessions_session_id_idx ON sessions(session_id);
CREATE INDEX sessions_request_type_idx ON sessions(request_type);
CREATE INDEX sessions_started_at_idx ON sessions(started_at);
CREATE INDEX sessions_account_id_idx ON sessions(account_id);

CREATE INDEX actions_log_session_id_idx ON actions_log(session_id);
CREATE INDEX actions_log_action_type_idx ON actions_log(action_type);
CREATE INDEX actions_log_timestamp_idx ON actions_log(timestamp);
CREATE INDEX actions_log_sequence_number_idx ON actions_log(sequence_number);
