-- Merge legacy health_checks table into health_test_results
-- This migration extends health_test_results, backfills data, and drops the legacy table

PRAGMA foreign_keys = ON;

-- 1) Extend health_test_results with legacy fields (endpoint, overall_status)
ALTER TABLE health_test_results ADD COLUMN endpoint TEXT;
ALTER TABLE health_test_results ADD COLUMN overall_status TEXT;

-- 2) Backfill endpoint from health_tests.name (by FK)
UPDATE health_test_results AS htr
SET endpoint = (
  SELECT ht.name
  FROM health_tests AS ht
  WHERE ht.id = htr.health_test_id
)
WHERE endpoint IS NULL;

-- 3) Backfill overall_status from legacy health_checks by group and endpoint
-- First try to match by both group and endpoint
UPDATE health_test_results AS htr
SET overall_status = (
  SELECT hc.overall_status
  FROM health_checks AS hc
  WHERE hc.check_group_id = htr.run_group_id
    AND hc.endpoint = htr.endpoint
  LIMIT 1
)
WHERE overall_status IS NULL;

-- Fallback: match by group only if endpoint text differs
UPDATE health_test_results AS htr
SET overall_status = (
  SELECT hc.overall_status
  FROM health_checks AS hc
  WHERE hc.check_group_id = htr.run_group_id
  LIMIT 1
)
WHERE overall_status IS NULL;

-- 4) Validation queries (commented out - run manually if needed)
-- SELECT COUNT(*) as legacy_rows FROM health_checks;
-- SELECT COUNT(*) as migrated_rows FROM health_test_results WHERE run_group_id IN (SELECT DISTINCT check_group_id FROM health_checks);
-- SELECT COUNT(*) as rows_with_overall_status FROM health_test_results WHERE overall_status IS NOT NULL;

-- 5) Drop legacy table after validation
DROP TABLE IF EXISTS health_checks;

