-- Migration: Add coach_telemetry table for context coach inference tracking
CREATE TABLE IF NOT EXISTS "coach_telemetry" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"timestamp" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"prompt" TEXT NOT NULL,
	"inferred_product" TEXT,
	"inferred_action" TEXT,
	"inferred_method" TEXT,
	"confidence" INTEGER,
	"next_step" TEXT,
	"coach_message" TEXT,
	"result_status" TEXT,
	"execution_latency_ms" INTEGER,
	"raw_response" TEXT
);

