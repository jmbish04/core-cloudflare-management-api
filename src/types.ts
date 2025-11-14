import Cloudflare from 'cloudflare';
import { CloudflareApiClient } from './routes/api/apiClient';
import { LoggingService } from './services/logging';

// Environment bindings
export interface Env {
  // Secret Store Bindings
  CLOUDFLARE_ACCOUNT_ID: string; // Cloudflare Account ID
  CLOUDFLARE_ACCOUNT_TOKEN: string; // Account-scoped API token (preferred for most operations)
  CLOUDFLARE_USER_TOKEN: string; // User-scoped API token (for user-level operations like listing tokens)
  CLOUDFLARE_GLOBAL_ADMIN_TOKEN?: string; // Global admin token with full permissions (for self-healing other tokens)
  CLIENT_AUTH_TOKEN: string; // Auth token for incoming requests
  MANAGED_SECRETS_STORE: string; // Secret Store ID for managed token storage

  // Bindings
  DB: D1Database; // D1 for token inventory/audit
  LOG_TAILING_DO: DurableObjectNamespace; // Durable Object for WebSocket log tailing
  ASSETS: Fetcher; // Static assets binding for frontend
  KV: KVNamespace; // KV for storing coach threshold and other config

  // Optional
  BASE_URL?: string;
  OBSERVABILITY_AE?: AnalyticsEngineDataset;
  WORKER_URL?: string;
  
  // Context Coach Durable Object
  CONTEXT_COACH: DurableObjectNamespace; // Durable Object for context coaching
  
  // Workers AI binding (optional)
  AI?: Ai;
}

// Context variables
export interface Variables {
  cf: Cloudflare;
  accountId: string;
  startTime: number;
  requestId: string;
  apiClient?: CloudflareApiClient;
  loggingService?: LoggingService;
}

// Managed Token Record
export interface ManagedToken {
  id: string;
  token_name: string;
  token_id: string;
  purpose: string;
  created_at: string;
  created_by?: string;
  expires_at?: string;
  ttl_days?: number;
  permissions: string; // JSON
  related_resources?: string; // JSON
  secret_key: string;
  status: 'active' | 'expired' | 'revoked';
  last_used_at?: string;
  use_count: number;
  metadata?: string; // JSON
}

import { PolicyParam } from 'cloudflare/resources/user/tokens/tokens';

// ... (rest of the file)

// Token creation request
export interface CreateTokenRequest {
  name: string;
  purpose: string;
  permissions: Array<{
    id: string;
    name?: string;
  }>;
  ttl_days?: number;
  related_resources?: Record<string, string>;
  policies: PolicyParam[];
  not_before?: string;
  expires_on?: string;
  condition?: any;
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

// Calculate expiration date
export function calculateExpiresAt(ttlDays?: number): string | undefined {
  if (!ttlDays) return undefined;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return expiresAt.toISOString();
}

/**
 * Get the appropriate Cloudflare API token based on the operation type
 * @param env - Environment bindings
 * @param preferUserToken - If true, prefer user token for user-level operations
 * @returns The appropriate API token
 */
export function getCloudflareToken(env: Env, preferUserToken: boolean = false): string {
  // If user token is explicitly requested and available, use it
  if (preferUserToken && env.CLOUDFLARE_USER_TOKEN) {
    return env.CLOUDFLARE_USER_TOKEN;
  }
  
  // Prefer account token over legacy token
  if (env.CLOUDFLARE_ACCOUNT_TOKEN) {
    return env.CLOUDFLARE_ACCOUNT_TOKEN;
  }
  
  // Fall back to legacy token for backward compatibility
  if (env.CLOUDFLARE_ACCOUNT_TOKEN) {
    return env.CLOUDFLARE_ACCOUNT_TOKEN;
  }
  
  throw new Error('No Cloudflare API token configured. Please set CLOUDFLARE_ACCOUNT_TOKEN or CLOUDFLARE_USER_TOKEN.');
}
