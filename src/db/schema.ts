import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Legacy health checks table (kept for backward compatibility)
export const healthChecks = sqliteTable('health_checks', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull(),
  status: integer('status').notNull(),
  statusText: text('status_text').notNull(),
  response_time_ms: integer('response_time_ms').notNull(),
  run_at: text('run_at').notNull(),
  check_group_id: text('check_group_id').notNull(),
  overall_status: text('overall_status'), // 'pass', 'fail', 'degraded'
});

// Health test definitions - stores registered tests
export const healthTests = sqliteTable('health_tests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // e.g., "List Workers"
  endpoint_path: text('endpoint_path').notNull(), // e.g., "/api/workers/scripts"
  http_method: text('http_method').notNull().default('GET'), // GET, POST, etc.
  category: text('category').notNull(), // 'api', 'health', 'meta'
  description: text('description'), // Description of what the test does
  request_body: text('request_body'), // JSON string for POST requests
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true), // Soft delete flag
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// Health test results - stores actual test run results
export const healthTestResults = sqliteTable('health_test_results', {
  id: text('id').primaryKey(),
  health_test_id: text('health_test_id').notNull().references(() => healthTests.id),
  run_group_id: text('run_group_id').notNull(), // Groups results from same health check run
  status: integer('status').notNull(), // HTTP status code
  status_text: text('status_text').notNull(),
  response_time_ms: integer('response_time_ms').notNull(),
  outcome: text('outcome').notNull(), // 'pass' or 'fail'
  error_message: text('error_message'), // Error details if failed
  response_body: text('response_body'), // Optional: store response for debugging
  run_at: text('run_at').notNull(),
});

// Define relations
export const healthTestsRelations = relations(healthTests, ({ many }) => ({
  results: many(healthTestResults),
}));

export const healthTestResultsRelations = relations(healthTestResults, ({ one }) => ({
  health_test: one(healthTests, {
    fields: [healthTestResults.health_test_id],
    references: [healthTests.id],
  }),
}));

// API Permissions Map - maps Cloudflare token permissions to API base paths
export const apiPermissionsMap = sqliteTable('api_permissions_map', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  permission: text('permission').notNull(), // e.g., "Workers Scripts:Edit"
  base_path: text('base_path').notNull(), // e.g., "/accounts/{account_id}/workers/scripts"
  description: text('description'), // Description of what the permission allows
});

// Coach Telemetry - tracks context coach inferences and self-tuning
export const coachTelemetry = sqliteTable('coach_telemetry', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default('CURRENT_TIMESTAMP'),
  prompt: text('prompt').notNull(),
  inferred_product: text('inferred_product'),
  inferred_action: text('inferred_action'),
  inferred_method: text('inferred_method'),
  confidence: integer('confidence'), // Stored as integer (0-100) for SQLite compatibility
  next_step: text('next_step'), // 'clarify' | 'execute'
  coach_message: text('coach_message'),
  result_status: text('result_status'), // 'executed' | 'clarified' | 'failed'
  execution_latency_ms: integer('execution_latency_ms'),
  raw_response: text('raw_response'), // JSON string of full coach response
});
