-- Add FK to health_test_results for self-healing attempts
-- This links each healing attempt directly to the specific failed test result

ALTER TABLE self_healing_attempts ADD COLUMN health_test_result_id TEXT;
