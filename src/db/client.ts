import { drizzle } from 'drizzle-orm/d1';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import * as schema from './schema';

// Database types for Kysely - using actual column names from the schema
export type Database = {
  // Health check tables
  health_checks: {
    id: string;
    endpoint: string;
    status: number;
    status_text: string;
    response_time_ms: number;
    run_at: string;
    check_group_id: string;
    overall_status: string | null;
  };
  health_tests: {
    id: string;
    name: string;
    endpoint_path: string;
    http_method: string;
    category: string;
    description: string | null;
    request_body: string | null;
    enabled: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
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
  };

  // Unit test tables
  unit_test_definitions: {
    id: string;
    test_key: string;
    name: string;
    scope: string;
    category: string | null;
    description: string | null;
    executor_key: string;
    error_meanings_json: string | null;
    error_solutions_json: string | null;
    metadata: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  unit_test_results: {
    id: string;
    session_uuid: string;
    test_definition_id: string;
    status: string;
    http_status: number | null;
    http_status_text: string | null;
    total_ms: number;
    run_at: string;
    verbose_output: string | null;
    error_details: string | null;
    ai_prompt_to_fix_error: string | null;
    ai_human_readable_error_description: string | null;
    ai_model_response: string | null;
    metadata: string | null;
  };
  unit_test_sessions: {
    session_uuid: string;
    trigger_source: string;
    started_at: string;
    completed_at: string;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    duration_ms: number;
    notes: string | null;
    created_at: string;
  };

  // API permissions
  api_permissions_map: {
    id: number;
    permission: string;
    base_path: string;
    description: string | null;
  };

  // Coach telemetry
  coach_telemetry: {
    id: number;
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
};

export interface DbClients {
  drizzle: ReturnType<typeof drizzle<typeof schema>>;
  kysely: Kysely<Database>;
}

/**
 * Initialize both Drizzle and Kysely clients for the database
 * This provides a hybrid ORM approach where:
 * - Drizzle handles schema, migrations, and simple CRUD operations
 * - Kysely handles complex queries, joins, and dynamic filtering
 */
export function initDb(env: { DB: D1Database }): DbClients {
  return {
    drizzle: drizzle(env.DB, { schema }),
    kysely: new Kysely<Database>({
      dialect: new D1Dialect({ database: env.DB }),
    }),
  };
}
