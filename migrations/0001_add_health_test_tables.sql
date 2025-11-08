CREATE TABLE `health_test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`health_test_id` text NOT NULL,
	`run_group_id` text NOT NULL,
	`status` integer NOT NULL,
	`status_text` text NOT NULL,
	`response_time_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	`error_message` text,
	`response_body` text,
	`run_at` text NOT NULL,
	FOREIGN KEY (`health_test_id`) REFERENCES `health_tests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `health_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint_path` text NOT NULL,
	`http_method` text DEFAULT 'GET' NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`request_body` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
