-- Final Squashed Schema for core-cloudflare-management-api
-- This represents the complete schema after all migrations through 0016
-- Use this for bootstrapping new databases
-- For existing databases, continue using incremental migrations

PRAGMA foreign_keys = ON;

-- api_permissions_map (with verbs)
CREATE TABLE IF NOT EXISTS api_permissions_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission TEXT NOT NULL,
  base_path TEXT NOT NULL,
  verbs TEXT,
  description TEXT
);

-- manage_tokens
CREATE TABLE IF NOT EXISTS manage_tokens (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  permissions TEXT,
  policies TEXT,
  issued_on TEXT,
  expires_on TEXT,
  last_verified TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS manage_tokens_token_id_idx ON manage_tokens(token_id);
CREATE INDEX IF NOT EXISTS manage_tokens_status_idx ON manage_tokens(status);
CREATE INDEX IF NOT EXISTS manage_tokens_last_verified_idx ON manage_tokens(last_verified);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL,
  request_method TEXT,
  request_path TEXT,
  request_headers TEXT,
  request_body TEXT,
  user_agent TEXT,
  client_ip TEXT,
  account_id TEXT,
  user_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  status_code INTEGER,
  response_size INTEGER,
  error_message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_session_id_idx ON sessions(session_id);
CREATE INDEX IF NOT EXISTS sessions_request_type_idx ON sessions(request_type);
CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at);
CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);

-- actions_log
CREATE TABLE IF NOT EXISTS actions_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  error_message TEXT,
  metadata TEXT,
  sequence_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS actions_log_session_id_idx ON actions_log(session_id);
CREATE INDEX IF NOT EXISTS actions_log_action_type_idx ON actions_log(action_type);
CREATE INDEX IF NOT EXISTS actions_log_timestamp_idx ON actions_log(timestamp);
CREATE INDEX IF NOT EXISTS actions_log_sequence_number_idx ON actions_log(sequence_number);

-- health_tests (with consolidated fields and indexes)
CREATE TABLE IF NOT EXISTS health_tests (
  id TEXT PRIMARY KEY,
  test_key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'internal',
  endpoint_path TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'GET',
  category TEXT NOT NULL,
  description TEXT,
  executor_key TEXT NOT NULL DEFAULT 'http',
  error_meanings_json TEXT,
  error_solutions_json TEXT,
  metadata TEXT,
  request_body TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS health_tests_test_key_unique ON health_tests(test_key);
CREATE INDEX IF NOT EXISTS health_tests_scope_idx ON health_tests(scope);
CREATE INDEX IF NOT EXISTS health_tests_executor_key_idx ON health_tests(executor_key);

-- health_test_results (includes legacy fields endpoint, overall_status)
CREATE TABLE IF NOT EXISTS health_test_results (
  id TEXT PRIMARY KEY,
  health_test_id TEXT NOT NULL,
  run_group_id TEXT NOT NULL,
  status INTEGER NOT NULL,
  status_text TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  error_message TEXT,
  response_body TEXT,
  run_at TEXT NOT NULL,
  endpoint TEXT,
  overall_status TEXT,
  FOREIGN KEY (health_test_id) REFERENCES health_tests(id)
);

-- self_healing_attempts (with health_test_result_id column)
CREATE TABLE IF NOT EXISTS self_healing_attempts (
  id TEXT PRIMARY KEY,
  health_check_group_id TEXT NOT NULL,
  health_test_result_id TEXT,
  health_test_id TEXT,
  ai_analysis TEXT NOT NULL,
  ai_recommendation TEXT NOT NULL,
  healing_action TEXT NOT NULL,
  action_details TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  verification_result TEXT,
  effectiveness_analysis TEXT,
  manual_steps_required TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- self_healing_steps
CREATE TABLE IF NOT EXISTS self_healing_steps (
  id TEXT PRIMARY KEY,
  healing_attempt_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_thoughts TEXT,
  decision TEXT,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (healing_attempt_id) REFERENCES self_healing_attempts(id)
);

-- coach_telemetry
CREATE TABLE IF NOT EXISTS coach_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
  prompt TEXT NOT NULL,
  inferred_product TEXT,
  inferred_action TEXT,
  inferred_method TEXT,
  confidence INTEGER,
  next_step TEXT,
  coach_message TEXT,
  result_status TEXT,
  execution_latency_ms INTEGER,
  raw_response TEXT
);

