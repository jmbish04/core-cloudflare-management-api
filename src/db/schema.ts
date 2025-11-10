import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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

// Robust unit test definitions (new framework)
export const unitTestDefinitions = sqliteTable(
  'unit_test_definitions',
  {
    id: text('id').primaryKey(),
    testKey: text('test_key').notNull(),
    name: text('name').notNull(),
    scope: text('scope').notNull().default('internal'),
    category: text('category'),
    description: text('description'),
    executorKey: text('executor_key').notNull().default('http'),
    errorMeaningsJson: text('error_meanings_json'),
    errorSolutionsJson: text('error_solutions_json'),
    metadata: text('metadata'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    testKeyIdx: index('unit_test_definitions_test_key_idx').on(table.testKey),
    testKeyUnique: uniqueIndex('unit_test_definitions_test_key_unique').on(table.testKey),
  })
);

export const unitTestResults = sqliteTable(
  'unit_test_results',
  {
    id: text('id').primaryKey(),
    sessionUuid: text('session_uuid').notNull(),
    testDefinitionId: text('test_definition_id')
      .notNull()
      .references(() => unitTestDefinitions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    httpStatusText: text('http_status_text'),
    totalMs: integer('total_ms').notNull(),
    runAt: text('run_at').notNull(),
    verboseOutput: text('verbose_output'),
    errorDetails: text('error_details'),
    aiPromptToFixError: text('ai_prompt_to_fix_error'),
    aiHumanReadableErrorDescription: text('ai_human_readable_error_description'),
    aiModelResponse: text('ai_model_response'),
    metadata: text('metadata'),
  },
  (table) => ({
    sessionIdx: index('unit_test_results_session_idx').on(table.sessionUuid),
    testIdx: index('unit_test_results_test_idx').on(table.testDefinitionId),
  })
);

export const unitTestSessions = sqliteTable(
  'unit_test_sessions',
  {
    sessionUuid: text('session_uuid').primaryKey(),
    triggerSource: text('trigger_source').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at').notNull(),
    totalTests: integer('total_tests').notNull(),
    passedTests: integer('passed_tests').notNull(),
    failedTests: integer('failed_tests').notNull(),
    durationMs: integer('duration_ms').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
    startedIdx: index('unit_test_sessions_started_idx').on(table.startedAt),
  })
);

export const unitTestDefinitionsRelations = relations(unitTestDefinitions, ({ many }) => ({
  results: many(unitTestResults),
}));

export const unitTestResultsRelations = relations(unitTestResults, ({ one }) => ({
  definition: one(unitTestDefinitions, {
    fields: [unitTestResults.testDefinitionId],
    references: [unitTestDefinitions.id],
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

// Self-Healing Attempts - tracks AI-powered self-healing attempts
export const selfHealingAttempts = sqliteTable('self_healing_attempts', {
  id: text('id').primaryKey(),
  health_check_group_id: text('health_check_group_id').notNull(), // Links to health_test_results.run_group_id
  health_test_id: text('health_test_id'), // Specific test being healed (optional)
  ai_analysis: text('ai_analysis').notNull(), // AI's analysis of the problem
  ai_recommendation: text('ai_recommendation').notNull(), // AI's recommended fix
  healing_action: text('healing_action').notNull(), // Action taken (e.g., 'update_token_permissions', 'retry_request')
  action_details: text('action_details'), // JSON string with action parameters
  status: text('status').notNull(), // 'pending' | 'in_progress' | 'success' | 'failed'
  error_message: text('error_message'), // Error if healing failed
  verification_result: text('verification_result'), // Result of verifying the fix
  effectiveness_analysis: text('effectiveness_analysis'), // AI's analysis of whether healing was effective
  manual_steps_required: text('manual_steps_required'), // Manual steps if healing wasn't fully effective
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// Self-Healing Steps - detailed step-by-step logs of healing process
export const selfHealingSteps = sqliteTable('self_healing_steps', {
  id: text('id').primaryKey(),
  healing_attempt_id: text('healing_attempt_id').notNull().references(() => selfHealingAttempts.id),
  step_number: integer('step_number').notNull(), // Order of the step
  step_type: text('step_type').notNull(), // 'thinking' | 'decision' | 'action' | 'verification' | 'analysis'
  title: text('title').notNull(), // Step title
  content: text('content').notNull(), // Step content/description
  ai_thoughts: text('ai_thoughts'), // AI's thinking process for this step
  decision: text('decision'), // Decision made at this step
  status: text('status').notNull(), // 'pending' | 'in_progress' | 'completed' | 'failed'
  metadata: text('metadata'), // JSON string with additional step data
  created_at: text('created_at').notNull(),
});
