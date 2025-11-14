import { Kysely, Generated } from 'kysely';
import { D1Dialect } from 'kysely-d1';

// Database types for Kysely - complete schema matching final migration state
export type Database = {
  // Manage Tokens table
  manage_tokens: {
    id: string;
    token_id: string;
    name: string | null;
    status: string;
    permissions: string | null;
    policies: string | null;
    issued_on: string | null;
    expires_on: string | null;
    last_verified: string;
    created_at: string;
    updated_at: string;
  };

  // Sessions table
  sessions: {
    id: string;
    session_id: string;
    request_type: string;
    request_method: string | null;
    request_path: string | null;
    request_headers: string | null;
    request_body: string | null;
    user_agent: string | null;
    client_ip: string | null;
    account_id: string | null;
    user_id: string | null;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    status_code: number | null;
    response_size: number | null;
    error_message: string | null;
    metadata: string | null;
    created_at: string;
  };

  // Actions log table
  actions_log: {
    id: string;
    session_id: string;
    action_type: string;
    action_name: string;
    timestamp: string;
    duration_ms: number | null;
    status: string;
    input_data: string | null;
    output_data: string | null;
    error_message: string | null;
    metadata: string | null;
    sequence_number: number;
    created_at: string;
  };

  // Health tests table (consolidated with unit_test_definitions fields)
  health_tests: {
    id: string;
    test_key: string;
    name: string;
    scope: string;
    endpoint_path: string;
    http_method: string;
    category: string;
    description: string | null;
    executor_key: string;
    error_meanings_json: string | null;
    error_solutions_json: string | null;
    metadata: string | null;
    request_body: string | null;
    enabled: number; // SQLite boolean as integer
    is_active: number; // SQLite boolean as integer
    created_at: string;
    updated_at: string;
  };

  // Health test results (includes legacy health_checks fields)
  health_test_results: {
    id: string;
    health_test_id: string;
    run_group_id: string;
    status: number;
    status_text: string;
    response_time_ms: number;
    outcome: string;
    error_message: string | null;
    response_body: string | null;
    run_at: string;
    endpoint: string | null; // From legacy health_checks
    overall_status: string | null; // From legacy health_checks
  };

  // API permissions (with verbs column)
  api_permissions_map: {
    id: Generated<number>; // AUTOINCREMENT
    permission: string;
    base_path: string;
    verbs: string | null;
    description: string | null;
  };

  // Coach telemetry
  coach_telemetry: {
    id: Generated<number>; // AUTOINCREMENT
    timestamp: string;
    prompt: string;
    inferred_product: string | null;
    inferred_action: string | null;
    inferred_method: string | null;
    confidence: number | null;
    next_step: string | null;
    coach_message: string | null;
    result_status: string | null;
    execution_latency_ms: number | null;
    raw_response: string | null;
  };

  // Self-healing tables
  self_healing_attempts: {
    id: string;
    health_check_group_id: string;
    health_test_result_id: string | null;
    health_test_id: string | null;
    ai_analysis: string;
    ai_recommendation: string;
    healing_action: string;
    action_details: string | null;
    status: string;
    error_message: string | null;
    verification_result: string | null;
    effectiveness_analysis: string | null;
    manual_steps_required: string | null;
    created_at: string;
    updated_at: string;
  };
  self_healing_steps: {
    id: string;
    healing_attempt_id: string;
    step_number: number;
    step_type: string;
    title: string;
    content: string;
    ai_thoughts: string | null;
    decision: string | null;
    status: string;
    metadata: string | null;
    created_at: string;
  };

  // Insight fixes table - tracks when AI-identified issues are resolved
  insight_fixes: {
    id: string;
    insight_type: string;
    insight_category: string | null;
    fix_description: string;
    fixed_at: string;
    fixed_by: string | null;
    metadata: string | null;
    created_at: string;
    updated_at: string;
  };

  // Token health log - tracks token health check events
  token_health_log: {
    id: Generated<number>; // AUTOINCREMENT
    event_type: string;
    metadata: string;
    created_at: Generated<string>; // Has DEFAULT CURRENT_TIMESTAMP
  };
};

/**
 * Initialize Kysely client for the database
 * Uses the official kysely-d1 dialect for Cloudflare D1 integration
 */
export function initDb(env: { DB: D1Database }): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new D1Dialect({ database: env.DB }),
  });
}
