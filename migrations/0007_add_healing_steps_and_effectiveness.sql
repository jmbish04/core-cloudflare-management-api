CREATE TABLE `self_healing_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`healing_attempt_id` text NOT NULL,
	`step_number` integer NOT NULL,
	`step_type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`ai_thoughts` text,
	`decision` text,
	`status` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`healing_attempt_id`) REFERENCES `self_healing_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_unit_test_sessions` (
	`session_uuid` text PRIMARY KEY NOT NULL,
	`trigger_source` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`total_tests` integer NOT NULL,
	`passed_tests` integer NOT NULL,
	`failed_tests` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_unit_test_sessions`("session_uuid", "trigger_source", "started_at", "completed_at", "total_tests", "passed_tests", "failed_tests", "duration_ms", "notes", "created_at") SELECT "session_uuid", "trigger_source", "started_at", "completed_at", "total_tests", "passed_tests", "failed_tests", "duration_ms", "notes", "created_at" FROM `unit_test_sessions`;--> statement-breakpoint
DROP TABLE `unit_test_sessions`;--> statement-breakpoint
ALTER TABLE `__new_unit_test_sessions` RENAME TO `unit_test_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `unit_test_sessions_started_idx` ON `unit_test_sessions` (`started_at`);--> statement-breakpoint
-- Add columns if they don't exist (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
-- We'll handle this manually if the migration fails
CREATE UNIQUE INDEX `unit_test_definitions_test_key_unique` ON `unit_test_definitions` (`test_key`);