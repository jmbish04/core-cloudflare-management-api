CREATE TABLE `coach_telemetry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`prompt` text NOT NULL,
	`inferred_product` text,
	`inferred_action` text,
	`inferred_method` text,
	`confidence` integer,
	`next_step` text,
	`coach_message` text,
	`result_status` text,
	`execution_latency_ms` integer,
	`raw_response` text
);
