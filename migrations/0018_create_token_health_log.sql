-- Migration: Create token_health_log table for tracking token health checks
CREATE TABLE IF NOT EXISTS "token_health_log" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"event_type" TEXT NOT NULL,
	"metadata" TEXT NOT NULL,
	"created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add index for efficient querying by event_type
CREATE INDEX IF NOT EXISTS "idx_token_health_log_event_type" ON "token_health_log"("event_type");

-- Add index for efficient querying by created_at
CREATE INDEX IF NOT EXISTS "idx_token_health_log_created_at" ON "token_health_log"("created_at");
