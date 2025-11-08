import { drizzle } from 'drizzle-orm/d1';
import { desc, sql } from 'drizzle-orm';
import { coachTelemetry } from '../db/schema';
import { Env } from '../types';

export interface CoachSuggestion {
  confidence: number;
  product: string | null;
  action: string | null;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | null;
  next_step: 'clarify' | 'execute';
  coach_message: string;
}

export interface CoachTelemetryRecord {
  prompt: string;
  product?: string | null;
  action?: string | null;
  method?: string | null;
  confidence?: number | null;
  next_step?: string | null;
  coach_message?: string | null;
  result_status?: 'executed' | 'clarified' | 'failed';
  execution_latency_ms?: number | null;
  raw_response?: any;
}

export class CoachTelemetryService {
  private db;

  constructor(private env: Env) {
    this.db = drizzle(env.DB, { schema: { coachTelemetry } });
  }

  async log(record: CoachTelemetryRecord): Promise<void> {
    try {
      // Convert confidence from 0-1 to 0-100 for integer storage
      const confidenceInt = record.confidence !== null && record.confidence !== undefined
        ? Math.round(record.confidence * 100)
        : null;

      await this.env.DB.prepare(
        `INSERT INTO coach_telemetry (
          timestamp, prompt, inferred_product, inferred_action, inferred_method,
          confidence, next_step, coach_message, result_status, execution_latency_ms, raw_response
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        new Date().toISOString(),
        record.prompt ?? '',
        record.product ?? null,
        record.action ?? null,
        record.method ?? null,
        confidenceInt,
        record.next_step ?? null,
        record.coach_message ?? null,
        record.result_status ?? 'unknown',
        record.execution_latency_ms ?? null,
        JSON.stringify(record.raw_response ?? {})
      ).run();
    } catch (err: any) {
      console.error('Telemetry insert failed:', err);
      // Don't throw - telemetry failures shouldn't break the API
    }
  }

  async getRecent(limit = 50): Promise<any[]> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT * FROM coach_telemetry ORDER BY id DESC LIMIT ?`
      ).bind(limit).all();
      return result.results || [];
    } catch (err: any) {
      console.error('Failed to fetch recent telemetry:', err);
      return [];
    }
  }

  async getRollingStats(days = 7): Promise<{
    total: number;
    clarifications: number;
    executed: number;
    avg_confidence: number;
  }> {
    try {
      const result = await this.env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN result_status = 'clarified' THEN 1 ELSE 0 END) AS clarifications,
          SUM(CASE WHEN result_status = 'executed' THEN 1 ELSE 0 END) AS executed,
          AVG(confidence) AS avg_confidence
        FROM coach_telemetry
        WHERE timestamp > datetime('now', ?)
      `).bind(`-${days} days`).first<{
        total: number;
        clarifications: number;
        executed: number;
        avg_confidence: number | null;
      }>();

      return {
        total: result?.total || 0,
        clarifications: result?.clarifications || 0,
        executed: result?.executed || 0,
        avg_confidence: result?.avg_confidence ? result.avg_confidence / 100 : 0, // Convert back to 0-1
      };
    } catch (err: any) {
      console.error('Failed to get rolling stats:', err);
      return { total: 0, clarifications: 0, executed: 0, avg_confidence: 0 };
    }
  }
}

/**
 * Auto-tune the clarification threshold based on rolling stats
 * Adjusts threshold to minimize unnecessary clarifications while maintaining accuracy
 */
export async function autoTuneThreshold(env: Env): Promise<{
  clarRate: number;
  avgConf: number;
  newThreshold: number;
}> {
  const telemetry = new CoachTelemetryService(env);
  const stats = await telemetry.getRollingStats(7);

  const clarRate = stats.total > 0 ? stats.clarifications / stats.total : 0;
  const avgConf = stats.avg_confidence || 0.7;

  // Adaptive threshold: lower if confidence is high and clarifications are low
  // Higher if clarifications are high (need more guidance)
  let newThreshold = avgConf - clarRate * 0.1;
  
  // Clamp between 0.55 and 0.9 for safety
  newThreshold = Math.min(Math.max(newThreshold, 0.55), 0.9);

  // Store in KV for fast access
  await env.KV.put('clarify_threshold', newThreshold.toFixed(2));

  console.log(`[Coach AutoTune] Set clarification threshold → ${newThreshold.toFixed(2)} (clarRate: ${(clarRate * 100).toFixed(1)}%, avgConf: ${(avgConf * 100).toFixed(1)}%)`);

  return { clarRate, avgConf, newThreshold };
}

