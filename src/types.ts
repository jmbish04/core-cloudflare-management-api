import Cloudflare from 'cloudflare';

// Environment bindings
export interface Env {
  // Secret Store Bindings
  CLOUDFLARE_ACCOUNT_ID: string; // Cloudflare Account ID
  CLOUDFLARE_TOKEN: string; // Worker's own Cloudflare API token
  CLIENT_AUTH_TOKEN: string; // Auth token for incoming requests
  MANAGED_SECRETS_STORE: string; // Secret Store ID for managed token storage

  // Bindings
  TOKEN_AUDIT_DB: D1Database; // D1 for token inventory/audit
  LOG_TAILING_DO: DurableObjectNamespace; // Durable Object for WebSocket log tailing
  ASSETS: Fetcher; // Static assets binding for frontend

  // Optional
  OBSERVABILITY_AE?: AnalyticsEngineDataset;
}

// Context variables
export interface Variables {
  cf: Cloudflare;
  accountId: string;
  startTime: number;
  requestId: string;
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
  policies: Array<{
    effect: 'allow' | 'deny';
    resources: Record<string, string>;
    permission_groups: Array<{
      id: string;
      name?: string;
    }>;
  }>;
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
