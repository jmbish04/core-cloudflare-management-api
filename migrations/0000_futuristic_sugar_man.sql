CREATE TABLE `health_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`status` integer NOT NULL,
	`status_text` text NOT NULL,
	`response_time_ms` integer NOT NULL,
	`run_at` text NOT NULL,
	`check_group_id` text NOT NULL,
	`overall_status` text
);
