-- Migration: Create insight_fixes table to track when AI-identified issues are resolved
-- This allows the AI insight system to filter out already-fixed issues and prevent spam

CREATE TABLE IF NOT EXISTS insight_fixes (
  id TEXT PRIMARY KEY,
  insight_type TEXT NOT NULL,           -- e.g., 'error_analysis', 'self_healing', 'performance', 'failure_analysis'
  insight_category TEXT,                -- e.g., 'api', 'database', 'auth' (for failure_analysis)
  fix_description TEXT NOT NULL,        -- Human-readable description of what was fixed
  fixed_at TEXT NOT NULL,               -- ISO 8601 timestamp when fix was applied
  fixed_by TEXT,                        -- 'manual', 'auto', or user identifier
  metadata TEXT,                        -- JSON with additional context (e.g., affected endpoints, error rates before/after)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Index for quick lookups by insight type
CREATE INDEX IF NOT EXISTS insight_fixes_type_idx ON insight_fixes(insight_type);

-- Index for date-based filtering
CREATE INDEX IF NOT EXISTS insight_fixes_fixed_at_idx ON insight_fixes(fixed_at);

-- Index for category-based lookups (for failure_analysis)
CREATE INDEX IF NOT EXISTS insight_fixes_category_idx ON insight_fixes(insight_category);

