CREATE TABLE IF NOT EXISTS `self_healing_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`health_check_group_id` text NOT NULL,
	`health_test_id` text,
	`ai_analysis` text NOT NULL,
	`ai_recommendation` text NOT NULL,
	`healing_action` text NOT NULL,
	`action_details` text,
	`status` text NOT NULL,
	`error_message` text,
	`verification_result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
