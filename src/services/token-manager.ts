import { Env, getCloudflareToken } from '../types';
import { initDb, type Database } from '../db/client';
import { Kysely } from 'kysely';

/**
 * Required permissions for the account token
 * These are needed for the worker to manage Cloudflare resources
 * Format: { name: "Permission Group Name", scope: "read" | "write" }
 */
const REQUIRED_ACCOUNT_PERMISSIONS = [
  { name: 'Workers Scripts', scope: 'write' },
  { name: 'Workers KV Storage', scope: 'write' },
  { name: 'D1', scope: 'write' },
  { name: 'Workers R2 Storage', scope: 'write' },
  { name: 'Workers AI', scope: 'write' },
  { name: 'AI Gateway', scope: 'write' },
  { name: 'Queues', scope: 'write' },
  { name: 'Vectorize', scope: 'write' },
  { name: 'Hyperdrive', scope: 'write' },
  { name: 'Workers Tail', scope: 'read' },
  { name: 'Pages', scope: 'write' },
  { name: 'Images', scope: 'write' },
  { name: 'Cloudflare Tunnel', scope: 'write' },
  { name: 'Workers Observability', scope: 'write' },
];

/**
 * Required permissions for the user token
 * User tokens can have both user-level AND account-level permissions
 * These are the permissions needed for this worker's operations
 */
const REQUIRED_USER_PERMISSIONS = [
  // User-level permissions
  { name: 'API Tokens', scope: 'write' },
  
  // Account-level permissions (user tokens can have these too!)
  { name: 'Workers Scripts', scope: 'read' },
  { name: 'Workers KV Storage', scope: 'read' },
  { name: 'D1', scope: 'read' },
  { name: 'Workers AI', scope: 'read' },
  { name: 'Account', scope: 'read' }, // For listing accounts
];

/**
 * Defines a permission group as required in a policy.
 * (Based on the documentation's policy.permission_groups)
 */
export interface TokenPermissionGroupRef {
  id: string;
  name?: string; // Doc says name is cosmetic; ID is the key
}

/**
 * Defines a single Access Policy for a new token.
 * (Based on the documentation's policy object)
 */
export interface TokenPolicy {
  id?: string; // Doc says this is read-only, so optional on create
  effect: 'allow' | 'deny';
  /**
   * Defines what resources are allowed.
   * Examples:
   * { "com.cloudflare.api.account.<ACCOUNT_ID>": "*" }
   * { "com.cloudflare.api.account.zone.<ZONE_ID>": "*" }
   * { "com.cloudflare.api.account.<ACCOUNT_ID>": { "com.cloudflare.api.account.zone.*": "*" } }
   */
  resources: Record<string, string | Record<string, string>>;
  permission_groups: TokenPermissionGroupRef[];
}

/**
 * Defines the IP-based restrictions for a new token.
 * (Based on the documentation's condition object)
 */
export interface TokenCondition {
  'request.ip'?: {
    in?: string[];     // Array of CIDRs
    not_in?: string[]; // Array of CIDRs
  };
}

/**
 * The **complete payload** required to create a new token.
 * (Based on the documentation's step 3 example)
 */
export interface ApiTokenCreatePayload {
  name: string;
  policies: TokenPolicy[];
  /**
   * ISO 8601 string (e.g., "2020-04-01T05:20:00Z")
   * The time at which a token becomes active.
   */
  not_before?: string;
  /**
   * ISO 8601 string (e.g., "2020-04-10T00:00:00Z")
   * The time at which a token expires.
   */
  expires_on?: string;
  /**
   * The set of restrictions (e.g., IP filtering)
   */
  condition?: TokenCondition;
}

export interface TokenValidationResult {
  token_type: 'account' | 'user';
  token_id: string;
  is_valid: boolean;
  is_active: boolean;
  expires_on: string | null;
  missing_permissions: string[];
  has_all_permissions: boolean;
  verification_url: string;
  error?: string;
}

export interface TokenUpdateResult {
  success: boolean;
  token_type: 'account' | 'user';
  token_id: string;
  permissions_added: string[];
  permissions_already_present: string[];
  new_token_value?: string;
  error?: string;
  message: string;
}

export interface TokenHealthReport {
  timestamp: string;
  account_token: TokenValidationResult;
  user_token: TokenValidationResult;
  overall_health: 'healthy' | 'degraded' | 'unhealthy';
  recommendations: string[];
  auto_heal_attempted: boolean;
  auto_heal_results?: {
    account_token?: TokenUpdateResult;
    user_token?: TokenUpdateResult;
  };
}

export class TokenManagerService {
  private env: Env;
  private db: Kysely<Database>;
  private accountId: string;

  constructor(env: Env) {
    this.env = env;
    this.db = initDb(env);
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
  }

  /**
   * Verify a token using its specific verification endpoint
   */
  private async verifyToken(
    token: string,
    tokenType: 'account' | 'user'
  ): Promise<TokenValidationResult> {
    const verifyUrl =
      tokenType === 'account'
        ? `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/tokens/verify`
        : 'https://api.cloudflare.com/client/v4/user/tokens/verify';

    try {
      const response = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data: any = await response.json();

      if (!data.success) {
        return {
          token_type: tokenType,
          token_id: 'unknown',
          is_valid: false,
          is_active: false,
          expires_on: null,
          missing_permissions: [],
          has_all_permissions: false,
          verification_url: verifyUrl,
          error: data.errors?.[0]?.message || 'Token verification failed',
        };
      }

      const result = data.result;
      const tokenId = result.id;
      const status = result.status;
      const expiresOn = result.expires_on || null;

      // Get token details to check permissions
      const permissions = await this.getTokenPermissions(token, tokenId, tokenType);
      const requiredPerms =
        tokenType === 'account' ? REQUIRED_ACCOUNT_PERMISSIONS : REQUIRED_USER_PERMISSIONS;

      const missingPermissions = this.findMissingPermissions(permissions, requiredPerms);

      return {
        token_type: tokenType,
        token_id: tokenId,
        is_valid: true,
        is_active: status === 'active',
        expires_on: expiresOn,
        missing_permissions: missingPermissions,
        has_all_permissions: missingPermissions.length === 0,
        verification_url: verifyUrl,
      };
    } catch (error: any) {
      return {
        token_type: tokenType,
        token_id: 'unknown',
        is_valid: false,
        is_active: false,
        expires_on: null,
        missing_permissions: [],
        has_all_permissions: false,
        verification_url: verifyUrl,
        error: error.message || 'Failed to verify token',
      };
    }
  }

  /**
   * Get the permissions for a token
   */
  private async getTokenPermissions(
    token: string,
    tokenId: string,
    tokenType: 'account' | 'user'
  ): Promise<any[]> {
    try {
      // For user tokens, we need to use the user token to get its own details
      const url = `https://api.cloudflare.com/client/v4/user/tokens/${tokenId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data: any = await response.json();

      if (data.success && data.result) {
        return data.result.policies || [];
      }

      return [];
    } catch (error) {
      console.error(`Failed to get token permissions for ${tokenType} token:`, error);
      return [];
    }
  }

  /**
   * Find missing permissions by comparing current permissions with required ones
   */
  private findMissingPermissions(
    currentPolicies: any[],
    requiredPermissions: Array<{ name: string; scope: string }>
  ): string[] {
    const missing: string[] = [];

    for (const required of requiredPermissions) {
      const hasPermission = currentPolicies.some((policy) => {
        const permissionGroups = policy.permission_groups || [];
        return permissionGroups.some((pg: any) => {
          // Permission group names include the scope in the name
          // e.g., "Workers Scripts Read", "Workers Scripts Write", "API Tokens Write"
          const pgName = pg.name?.toLowerCase() || '';
          const requiredBaseName = required.name.toLowerCase();
          const requiredScope = required.scope.toLowerCase();
          
          // Check if the permission group matches the required permission and scope
          // e.g., "workers scripts read" matches { name: "Workers Scripts", scope: "read" }
          const nameWithScope = `${requiredBaseName} ${requiredScope}`;
          const matches = pgName === nameWithScope;
          
          // Also check if write permission covers read permission
          if (requiredScope === 'read') {
            const nameWithWrite = `${requiredBaseName} write`;
            return matches || pgName === nameWithWrite;
          }
          
          return matches;
        });
      });

      if (!hasPermission) {
        missing.push(`${required.name}:${required.scope}`);
      }
    }

    return missing;
  }

  /**
   * Update a token's permissions to include all required permissions
   * Uses global admin token (if available) or falls back to user token
   */
  private async updateTokenPermissions(
    targetTokenId: string,
    targetTokenType: 'account' | 'user',
    missingPermissions: string[]
  ): Promise<TokenUpdateResult> {
    try {
      // HEALING STRATEGY:
      // 1. Prefer GLOBAL_ADMIN_TOKEN (can see and edit ALL tokens)
      // 2. Fallback to USER_TOKEN (can only edit tokens it created/has access to)
      const authToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN || this.env.CLOUDFLARE_USER_TOKEN;
      const tokenSource = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';

      console.log(`🔄 Cross-token healing: Using ${tokenSource} token to modify ${targetTokenType.toUpperCase()} token`);

      // Get current token details (always use user token for this endpoint)
      const url = `https://api.cloudflare.com/client/v4/user/tokens/${targetTokenId}`;

      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      const currentData: any = await getResponse.json();

      if (!currentData.success) {
        return {
          success: false,
          token_type: targetTokenType,
          token_id: targetTokenId,
          permissions_added: [],
          permissions_already_present: [],
          error: 'Failed to get current token details',
          message: currentData.errors?.[0]?.message || 'Unknown error',
        };
      }

      const currentToken = currentData.result;
      const currentPolicies = currentToken.policies || [];

      // For user tokens, extract the user ID from existing policies
      let userId: string | undefined;
      if (targetTokenType === 'user') {
        for (const policy of currentPolicies) {
          const resources = policy.resources || {};
          for (const key of Object.keys(resources)) {
            if (key.startsWith('com.cloudflare.api.user.')) {
              userId = key.replace('com.cloudflare.api.user.', '');
              console.log(`📝 Extracted user ID from existing policy: ${userId}`);
              break;
            }
          }
          if (userId) break;
        }
        
        if (!userId) {
          return {
            success: false,
            token_type: targetTokenType,
            token_id: targetTokenId,
            permissions_added: [],
            permissions_already_present: [],
            error: 'Could not determine user ID from existing token policies',
            message: 'User tokens must be scoped to a specific user ID',
          };
        }
      }

      // Fetch permission groups from Cloudflare API to get correct IDs
      const permissionGroupsMap = await this.getCloudflareApiPermissions(authToken);

      // Build new policies with missing permissions added
      const requiredPerms =
        targetTokenType === 'account' ? REQUIRED_ACCOUNT_PERMISSIONS : REQUIRED_USER_PERMISSIONS;

      // For user tokens, separate user-level and account-level permissions
      const userLevelPermGroups: any[] = [];
      const accountLevelPermGroups: any[] = [];
      const permissionsAdded: string[] = [];

      // User-level permission names (these are scoped to user resources)
      const userLevelPermNames = ['api tokens'];

      for (const required of requiredPerms) {
        const permKey = `${required.name}:${required.scope}`;

        if (missingPermissions.includes(permKey)) {
          // Try to find the correct permission group ID from Cloudflare's API
          // Look up by name + scope (e.g., "workers scripts read")
          const lookupKey = `${required.name} ${required.scope}`.toLowerCase();
          const permGroup = permissionGroupsMap.get(lookupKey);
          
          if (permGroup) {
            const isUserLevel = userLevelPermNames.some(name => required.name.toLowerCase().includes(name));
            
            if (targetTokenType === 'user' && !isUserLevel) {
              // Account-level permission for user token
              accountLevelPermGroups.push({ id: permGroup.id });
            } else {
              // User-level permission or account token (all permissions are account-level)
              userLevelPermGroups.push({ id: permGroup.id });
            }
            
            permissionsAdded.push(permKey);
            console.log(`✅ Mapped "${required.name} ${required.scope}" → ${permGroup.id} (${permGroup.name}) [${isUserLevel ? 'user-level' : 'account-level'}]`);
          } else {
            console.warn(`⚠️ Could not find permission group for "${required.name} ${required.scope}"`);
            console.warn(`   Available keys: ${Array.from(permissionGroupsMap.keys()).filter(k => k.includes(required.name.toLowerCase().split(' ')[0])).join(', ')}`);
          }
        }
      }

      // Merge with existing policies
      const updatedPolicies = [...currentPolicies];

      // Add policy for user-level permissions (if any)
      if (userLevelPermGroups.length > 0) {
        updatedPolicies.push({
          effect: 'allow',
          permission_groups: userLevelPermGroups,
          resources:
            targetTokenType === 'account'
              ? { [`com.cloudflare.api.account.${this.accountId}`]: '*' }
              : { [`com.cloudflare.api.user.${userId}`]: '*' },
        });
      }

      // Add policy for account-level permissions (user tokens only)
      if (targetTokenType === 'user' && accountLevelPermGroups.length > 0) {
        updatedPolicies.push({
          effect: 'allow',
          permission_groups: accountLevelPermGroups,
          resources: { [`com.cloudflare.api.account.${this.accountId}`]: '*' },
        });
      }

      // Update the token using the cross-token authentication
      const updateResponse = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: currentToken.name,
          policies: updatedPolicies,
        }),
      });

      const updateData: any = await updateResponse.json();

      if (!updateData.success) {
        return {
          success: false,
          token_type: targetTokenType,
          token_id: targetTokenId,
          permissions_added: [],
          permissions_already_present: [],
          error: 'Failed to update token permissions',
          message: updateData.errors?.[0]?.message || 'Unknown error',
        };
      }

      console.log(`✅ Successfully updated ${targetTokenType} token with ${permissionsAdded.length} new permissions`);

      return {
        success: true,
        token_type: targetTokenType,
        token_id: targetTokenId,
        permissions_added: permissionsAdded,
        permissions_already_present: missingPermissions.filter(
          (p) => !permissionsAdded.includes(p)
        ),
        message: `Successfully added ${permissionsAdded.length} missing permissions using cross-token authentication`,
      };
    } catch (error: any) {
      return {
        success: false,
        token_type: targetTokenType,
        token_id: targetTokenId,
        permissions_added: [],
        permissions_already_present: [],
        error: error.message || 'Failed to update token',
        message: 'An error occurred while updating token permissions',
      };
    }
  }

  /**
   * Fetch permission groups from Cloudflare API to get correct IDs
   * This ensures we use the proper 32-character permission group IDs
   */
  private async getCloudflareApiPermissions(token: string): Promise<Map<string, any>> {
    const permMap = new Map<string, any>();

    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/permission_groups', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data: any = await response.json();

      if (data.success && data.result) {
        console.log(`📋 Fetched ${data.result.length} permission groups from Cloudflare API`);
        
        // Create comprehensive mapping for easier lookup
        for (const group of data.result) {
          // Map by ID
          permMap.set(group.id, group);
          
          // Map by exact name (case-insensitive)
          const normalizedName = group.name.toLowerCase();
          permMap.set(normalizedName, group);
          
          // Map by name with spaces replaced by underscores
          permMap.set(normalizedName.replace(/\s+/g, '_'), group);
          
          // Map by common resource patterns
          // e.g., "Workers Scripts" -> "com.cloudflare.api.account.workers.script"
          const resourcePatterns = [
            `com.cloudflare.api.account.${normalizedName.replace(/\s+/g, '.')}`,
            `com.cloudflare.api.account.${normalizedName.replace(/\s+/g, '_')}`,
            `com.cloudflare.api.account.${normalizedName.replace(/\s+/g, '')}`,
          ];
          
          for (const pattern of resourcePatterns) {
            permMap.set(pattern, group);
          }
          
          // Special mappings for common names
          if (normalizedName.includes('workers') && normalizedName.includes('script')) {
            permMap.set('com.cloudflare.api.account.workers.script', group);
          }
          if (normalizedName.includes('kv') || normalizedName.includes('storage')) {
            permMap.set('com.cloudflare.api.account.workers.kv', group);
          }
          if (normalizedName.includes('d1')) {
            permMap.set('com.cloudflare.api.account.d1', group);
          }
          if (normalizedName.includes('r2')) {
            permMap.set('com.cloudflare.api.account.workers.r2', group);
          }
          if (normalizedName.includes('ai') && !normalizedName.includes('gateway')) {
            permMap.set('com.cloudflare.api.account.ai', group);
          }
          if (normalizedName.includes('ai') && normalizedName.includes('gateway')) {
            permMap.set('com.cloudflare.api.account.ai_gateway', group);
          }
          if (normalizedName.includes('queue')) {
            permMap.set('com.cloudflare.api.account.workers.queues', group);
          }
          if (normalizedName.includes('vectorize')) {
            permMap.set('com.cloudflare.api.account.vectorize', group);
          }
          if (normalizedName.includes('hyperdrive')) {
            permMap.set('com.cloudflare.api.account.hyperdrive', group);
          }
          if (normalizedName.includes('tail')) {
            permMap.set('com.cloudflare.api.account.workers.tail', group);
          }
          if (normalizedName.includes('pages')) {
            permMap.set('com.cloudflare.api.account.pages', group);
          }
          if (normalizedName.includes('image')) {
            permMap.set('com.cloudflare.api.account.images', group);
          }
          if (normalizedName.includes('tunnel')) {
            permMap.set('com.cloudflare.api.account.tunnel', group);
          }
          if (normalizedName.includes('analytics')) {
            permMap.set('com.cloudflare.api.account.workers.analytics_engine', group);
          }
          if (normalizedName.includes('token')) {
            permMap.set('com.cloudflare.api.user.tokens', group);
          }
        }
        
        console.log(`✅ Created ${permMap.size} permission mappings`);
      } else {
        console.warn('⚠️ Failed to fetch permission groups from Cloudflare API, will use fallback IDs');
      }
    } catch (error: any) {
      console.error('Failed to fetch Cloudflare permission groups:', error);
    }

    return permMap;
  }

  /**
   * Check the health of both tokens and optionally auto-heal them
   */
  async checkTokenHealth(autoHeal: boolean = false): Promise<TokenHealthReport> {
    const timestamp = new Date().toISOString();

    // Validate account token
    const accountToken = this.env.CLOUDFLARE_ACCOUNT_TOKEN;
    const accountValidation = await this.verifyToken(accountToken, 'account');

    // Validate user token
    const userToken = this.env.CLOUDFLARE_USER_TOKEN;
    const userValidation = await this.verifyToken(userToken, 'user');

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!accountValidation.is_valid || !userValidation.is_valid) {
      overallHealth = 'unhealthy';
    } else if (
      !accountValidation.has_all_permissions ||
      !userValidation.has_all_permissions
    ) {
      overallHealth = 'degraded';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (!accountValidation.is_valid) {
      recommendations.push('❌ Account token is invalid. Please create a new account token.');
    } else if (!accountValidation.is_active) {
      recommendations.push('⚠️ Account token is not active. Please check token status.');
    } else if (!accountValidation.has_all_permissions) {
      recommendations.push(
        `⚠️ Account token is missing ${accountValidation.missing_permissions.length} permissions: ${accountValidation.missing_permissions.slice(0, 3).join(', ')}${accountValidation.missing_permissions.length > 3 ? '...' : ''}`
      );
    }

    if (!userValidation.is_valid) {
      recommendations.push('❌ User token is invalid. Please create a new user token.');
    } else if (!userValidation.is_active) {
      recommendations.push('⚠️ User token is not active. Please check token status.');
    } else if (!userValidation.has_all_permissions) {
      recommendations.push(
        `⚠️ User token is missing ${userValidation.missing_permissions.length} permissions: ${userValidation.missing_permissions.join(', ')}`
      );
    }

    if (accountValidation.expires_on) {
      const expiresAt = new Date(accountValidation.expires_on);
      const daysUntilExpiry = Math.floor(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry < 30) {
        recommendations.push(
          `⚠️ Account token expires in ${daysUntilExpiry} days. Consider rotating it.`
        );
      }
    }

    if (userValidation.expires_on) {
      const expiresAt = new Date(userValidation.expires_on);
      const daysUntilExpiry = Math.floor(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry < 30) {
        recommendations.push(
          `⚠️ User token expires in ${daysUntilExpiry} days. Consider rotating it.`
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All tokens are healthy and have required permissions.');
    }

    const report: TokenHealthReport = {
      timestamp,
      account_token: accountValidation,
      user_token: userValidation,
      overall_health: overallHealth,
      recommendations,
      auto_heal_attempted: autoHeal,
    };

    // Auto-heal if requested and needed
    if (autoHeal && overallHealth !== 'healthy') {
      const autoHealResults: any = {};

      // Try to heal account token using GLOBAL ADMIN token (or USER token as fallback)
      if (
        accountValidation.is_valid &&
        accountValidation.is_active &&
        !accountValidation.has_all_permissions
      ) {
        const healerToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';
        console.log(
          `🔧 Auto-healing account token (missing ${accountValidation.missing_permissions.length} permissions) using ${healerToken} token...`
        );
        autoHealResults.account_token = await this.updateTokenPermissions(
          accountValidation.token_id,
          'account',
          accountValidation.missing_permissions
        );
      }

      // Try to heal user token using GLOBAL ADMIN token (or USER token as fallback)
      if (
        userValidation.is_valid &&
        userValidation.is_active &&
        !userValidation.has_all_permissions
      ) {
        const healerToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';
        console.log(
          `🔧 Auto-healing user token (missing ${userValidation.missing_permissions.length} permissions) using ${healerToken} token...`
        );
        autoHealResults.user_token = await this.updateTokenPermissions(
          userValidation.token_id,
          'user',
          userValidation.missing_permissions
        );
      }

      report.auto_heal_results = autoHealResults;
    }

    // Log to database
    await this.logTokenHealthCheck(report);

    return report;
  }

  /**
   * Log token health check to database for tracking
   */
  private async logTokenHealthCheck(report: TokenHealthReport): Promise<void> {
    try {
      await this.db
        .insertInto('token_health_log')
        .values({
          event_type: 'token_health_check',
          metadata: JSON.stringify({
            overall_health: report.overall_health,
            account_token_valid: report.account_token.is_valid,
            account_token_has_all_perms: report.account_token.has_all_permissions,
            account_token_missing_perms: report.account_token.missing_permissions.length,
            user_token_valid: report.user_token.is_valid,
            user_token_has_all_perms: report.user_token.has_all_permissions,
            user_token_missing_perms: report.user_token.missing_permissions.length,
            auto_heal_attempted: report.auto_heal_attempted,
            auto_heal_success: report.auto_heal_results
              ? Object.values(report.auto_heal_results).every((r: any) => r.success)
              : null,
          }),
        })
        .execute();
    } catch (error) {
      console.error('Failed to log token health check:', error);
    }
  }

  /**
   * Manually heal tokens (public method for API endpoint)
   * Uses cross-token authentication strategy
   */
  async healTokens(): Promise<{
    success: boolean;
    account_token?: TokenUpdateResult;
    user_token?: TokenUpdateResult;
    message: string;
  }> {
    // First, check token health
    const healthReport = await this.checkTokenHealth(false);

    const results: any = {
      success: true,
      message: 'Token healing completed',
    };

    // Heal account token if needed (using GLOBAL ADMIN or USER token)
    if (
      healthReport.account_token.is_valid &&
      healthReport.account_token.is_active &&
      !healthReport.account_token.has_all_permissions
    ) {
      const healerToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';
      console.log(`🔧 Healing account token using ${healerToken} token...`);
      results.account_token = await this.updateTokenPermissions(
        healthReport.account_token.token_id,
        'account',
        healthReport.account_token.missing_permissions
      );
      
      if (!results.account_token.success) {
        results.success = false;
      }
    } else {
      results.account_token = {
        success: true,
        token_type: 'account',
        token_id: healthReport.account_token.token_id,
        permissions_added: [],
        permissions_already_present: [],
        message: 'Account token already has all required permissions',
      };
    }

    // Heal user token if needed (using GLOBAL ADMIN or USER token)
    if (
      healthReport.user_token.is_valid &&
      healthReport.user_token.is_active &&
      !healthReport.user_token.has_all_permissions
    ) {
      const healerToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';
      console.log(`🔧 Healing user token using ${healerToken} token...`);
      results.user_token = await this.updateTokenPermissions(
        healthReport.user_token.token_id,
        'user',
        healthReport.user_token.missing_permissions
      );
      
      if (!results.user_token.success) {
        results.success = false;
      }
    } else {
      results.user_token = {
        success: true,
        token_type: 'user',
        token_id: healthReport.user_token.token_id,
        permissions_added: [],
        permissions_already_present: [],
        message: 'User token already has all required permissions',
      };
    }

    if (!results.success) {
      results.message = 'Failed to heal some tokens';
    } else if (
      results.account_token.permissions_added.length === 0 &&
      results.user_token.permissions_added.length === 0
    ) {
      results.message = 'All tokens already have required permissions';
    } else {
      results.message = `Successfully healed tokens (Account: +${results.account_token.permissions_added.length} perms, User: +${results.user_token.permissions_added.length} perms)`;
    }

    return results;
  }

  /**
   * Get token health history from the database
   */
  async getTokenHealthHistory(limit: number = 10): Promise<any[]> {
    try {
      const results = await this.db
        .selectFrom('token_health_log')
        .select(['event_type', 'metadata', 'created_at'])
        .where('event_type', '=', 'token_health_check')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();

      return results.map((r) => ({
        timestamp: r.created_at,
        ...JSON.parse(r.metadata || '{}'),
      }));
    } catch (error) {
      console.error('Failed to get token health history:', error);
      return [];
    }
  }

  /**
   * List all available permission groups from Cloudflare API
   * Useful for debugging and understanding available permissions
   */
  async listPermissionGroups(): Promise<any[]> {
    try {
      const authToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN || this.env.CLOUDFLARE_USER_TOKEN;
      
      const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/permission_groups', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data: any = await response.json();

      if (data.success && data.result) {
        return data.result;
      }

      return [];
    } catch (error: any) {
      console.error('Failed to list permission groups:', error);
      return [];
    }
  }
}

