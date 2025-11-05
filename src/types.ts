import { z } from 'zod';
import Cloudflare from 'cloudflare';

// Environment bindings
export interface Env {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  WORKER_API_KEY: string;
  AUDIT_LOGS_DB: D1Database;
  OBSERVABILITY_AE: AnalyticsEngineDataset;
}

// Context variables
export interface Variables {
  cf: Cloudflare;
  accountId: string;
  startTime: number;
  requestId: string;
}

// Common error response schema
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

// Common success response wrapper
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    result: dataSchema,
  });

// Pagination query parameters
export const PaginationQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('50').transform(Number),
});

// Audit log entry
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  request_ip: string | null;
  request_method: string;
  request_url: string;
  request_headers: string | null;
  request_body: string | null;
  response_status: number;
  response_body: string | null;
  user_agent: string | null;
  auth_key_used: string | null;
  cloudflare_api_target: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

// Observability data point
export interface ObservabilityDataPoint {
  doubles?: number[];
  blobs?: string[];
  indexes?: string[];
}

// Common utility types
export type APIResponse<T> = {
  success: true;
  result: T;
} | {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
};

// Sanitize sensitive data from headers
export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-auth-token'];

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
}

// Generate UUID v4
export function generateUUID(): string {
  return crypto.randomUUID();
}

// Truncate large strings for logging
export function truncateString(str: string | null, maxLength: number = 1000): string | null {
  if (!str) return null;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '... [TRUNCATED]';
}
