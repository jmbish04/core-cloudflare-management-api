CREATE TABLE `unit_test_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`test_key` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL DEFAULT 'internal',
	`category` text,
	`description` text,
	`executor_key` text NOT NULL DEFAULT 'http',
	`error_meanings_json` text,
	`error_solutions_json` text,
	`metadata` text,
	`is_active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	UNIQUE (`test_key`)
);

CREATE TABLE `unit_test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_uuid` text NOT NULL,
	`test_definition_id` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`http_status_text` text,
	`total_ms` integer NOT NULL,
	`run_at` text NOT NULL,
	`verbose_output` text,
	`error_details` text,
	`ai_prompt_to_fix_error` text,
	`ai_human_readable_error_description` text,
	`ai_model_response` text,
	`metadata` text,
	FOREIGN KEY (`test_definition_id`) REFERENCES `unit_test_definitions`(`id`) ON UPDATE cascade ON DELETE cascade
);

CREATE TABLE `unit_test_sessions` (
	`session_uuid` text PRIMARY KEY NOT NULL,
	`trigger_source` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`total_tests` integer NOT NULL,
	`passed_tests` integer NOT NULL,
	`failed_tests` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `unit_test_definitions_test_key_idx` ON `unit_test_definitions` (`test_key`);
CREATE INDEX `unit_test_results_session_idx` ON `unit_test_results` (`session_uuid`);
CREATE INDEX `unit_test_results_test_idx` ON `unit_test_results` (`test_definition_id`);
CREATE INDEX `unit_test_sessions_started_idx` ON `unit_test_sessions` (`started_at`);
