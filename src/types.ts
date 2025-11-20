import Cloudflare from 'cloudflare';
import { CloudflareApiClient } from './routes/api/apiClient';

// Environment bindings
export interface Env {
  // Secret Store Bindings
  CLOUDFLARE_ACCOUNT_ID: string; // Cloudflare Account ID
  CLOUDFLARE_TOKEN: string; // Worker's own Cloudflare API token
  CLOUDFLARE_USER_TOKEN: string; // User-level Cloudflare API token for /user/tokens/* endpoints
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
  WORKERS_DEV_DOMAIN?: string; // Custom workers.dev subdomain (defaults to 'hacolby.workers.dev')

  // Context Coach Durable Object
  CONTEXT_COACH: DurableObjectNamespace; // Durable Object for context coaching

  // Consultation Session Durable Object
  CONSULTATION_SESSION: DurableObjectNamespace; // Durable Object for consultation sessions

  // Consultation Queue
  CONSULTATION_QUEUE?: Queue; // Queue for async consultation processing

  // Consultation KV
  CONSULTATION_KV?: KVNamespace; // KV for consultation caching

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
