-- Add missing fields from unit_test_definitions to health_tests table
-- This migration consolidates the duplicated test definition functionality

ALTER TABLE health_tests ADD COLUMN test_key TEXT NOT NULL DEFAULT '';
ALTER TABLE health_tests ADD COLUMN scope TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE health_tests ADD COLUMN executor_key TEXT NOT NULL DEFAULT 'http';
ALTER TABLE health_tests ADD COLUMN error_meanings_json TEXT;
ALTER TABLE health_tests ADD COLUMN error_solutions_json TEXT;
ALTER TABLE health_tests ADD COLUMN metadata TEXT;

-- Add unique constraint on test_key (after populating with data)
-- First, we need to populate test_key with unique values based on existing data
UPDATE health_tests SET test_key = LOWER(REPLACE(REPLACE(name, ' ', '_'), '-', '_')) WHERE test_key = '';

-- Create unique index on test_key
CREATE UNIQUE INDEX health_tests_test_key_unique ON health_tests(test_key);

-- Create index for performance
CREATE INDEX health_tests_scope_idx ON health_tests(scope);
CREATE INDEX health_tests_executor_key_idx ON health_tests(executor_key);
