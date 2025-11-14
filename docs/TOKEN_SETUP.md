# Cloudflare API Token Setup

This document explains the token configuration for the Core Cloudflare Management API.

## Token Types

The application supports two types of Cloudflare API tokens:

### 1. Account Token (`CLOUDFLARE_ACCOUNT_TOKEN`)

**Purpose**: Account-scoped operations (Workers, D1, KV, AI, etc.)

**Required Permissions**:
- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers R2 Storage: Edit
- D1: Edit
- Queues: Edit
- Vectorize: Edit
- Hyperdrive: Edit
- Workers AI: Edit
- AI Gateway: Edit
- Workers Pipelines: Edit
- Workers Builds Configuration: Edit
- Workers Observability: Edit
- Workers Tail: Read
- Cloudflare Pages: Edit
- Cloudflare Images: Edit
- Cloudflare Tunnel: Edit
- Browser Rendering: Edit
- AI Search: Edit
- Secrets Store: Edit
- Pub/Sub: Edit
- MCP Portals: Edit
- Workers R2 SQL: Read
- Workers R2 Data Catalog: Edit
- Workers Agents Configuration: Edit
- Containers: Edit
- Access: Service Tokens: Edit
- Account: SSL and Certificates: Edit
- Email Routing Addresses: Edit

**Scope**: Account-level (specific to your Cloudflare account)

### 2. User Token (`CLOUDFLARE_USER_TOKEN`)

**Purpose**: User-level operations (listing API tokens, user info, etc.)

**Required Permissions**:
- API Tokens: Edit (or Read)

**Scope**: User-level (all accounts accessible by the user)

### 3. Legacy Token (`CLOUDFLARE_TOKEN`)

**Status**: Deprecated (kept for backward compatibility)

**Migration**: This token is automatically used as a fallback if `CLOUDFLARE_ACCOUNT_TOKEN` is not set.

## Token Selection Logic

The application uses the `getCloudflareToken()` helper function to automatically select the appropriate token:

```typescript
import { getCloudflareToken } from './types';

// For most operations (account-scoped)
const token = getCloudflareToken(env);

// For user-level operations (e.g., listing tokens)
const token = getCloudflareToken(env, true); // preferUserToken = true
```

**Priority Order**:
1. If `preferUserToken=true` and `CLOUDFLARE_USER_TOKEN` is set → Use user token
2. If `CLOUDFLARE_ACCOUNT_TOKEN` is set → Use account token
3. If `CLOUDFLARE_TOKEN` is set → Use legacy token (fallback)
4. Otherwise → Throw error

## Configuration

### Local Development (`.dev.vars`)

```bash
# Account ID
CLOUDFLARE_ACCOUNT_ID="your-account-id"

# Account Token (primary)
CLOUDFLARE_ACCOUNT_TOKEN="your-account-token"

# User Token (for user-level operations)
CLOUDFLARE_USER_TOKEN="your-user-token"

# Legacy Token (optional, for backward compatibility)
CLOUDFLARE_TOKEN="your-legacy-token"

# Other required secrets
CLIENT_AUTH_TOKEN="your-auth-token"
WORKER_URL="https://your-worker.workers.dev"
BASE_URL="https://your-worker.workers.dev"
```

### Production (Wrangler Secrets)

Use the provided script to sync secrets to all environments:

```bash
# Sync all secrets to production
python3 scripts/manage-secrets.py --env production

# Sync all secrets to all environments
python3 scripts/manage-secrets.py --all

# Sync specific secrets to production
python3 scripts/manage-secrets.py --env production --keys CLOUDFLARE_ACCOUNT_TOKEN CLOUDFLARE_USER_TOKEN

# List all secrets
python3 scripts/manage-secrets.py --list
```

## Creating API Tokens

### Account Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Create Custom Token"
4. Set permissions as listed above
5. Set "Account Resources" to your specific account
6. Set TTL as needed (or leave blank for no expiration)
7. Click "Continue to summary" and "Create Token"
8. Copy the token and save it as `CLOUDFLARE_ACCOUNT_TOKEN`

### User Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Create Custom Token"
4. Add permission: "User" → "API Tokens" → "Edit" (or "Read")
5. Set "Account Resources" to "All accounts"
6. Set TTL as needed
7. Click "Continue to summary" and "Create Token"
8. Copy the token and save it as `CLOUDFLARE_USER_TOKEN`

## Testing Tokens

Use the provided token test script to verify your tokens:

```bash
# Test all token permissions
python3 scripts/test-cloudflare-token.py
```

This will test:
- ✅ Token verification
- ✅ Account access
- ✅ Workers scripts access
- ✅ D1 database access
- ✅ KV storage access
- ✅ AI models access
- ✅ API tokens read access

## Migration from Legacy Token

If you're currently using `CLOUDFLARE_TOKEN`, you can migrate gradually:

1. Create a new account token with the required permissions
2. Add it to `.dev.vars` as `CLOUDFLARE_ACCOUNT_TOKEN`
3. Test locally to ensure everything works
4. Deploy to production using the secrets management script
5. Optionally, keep `CLOUDFLARE_TOKEN` as a fallback during the transition
6. Once stable, you can remove `CLOUDFLARE_TOKEN`

## Troubleshooting

### "No Cloudflare API token configured" Error

**Cause**: None of the token environment variables are set.

**Solution**: Set at least `CLOUDFLARE_ACCOUNT_TOKEN` in your environment.

### "Invalid API Token" Error

**Cause**: Token is expired, revoked, or has incorrect permissions.

**Solution**: 
1. Run `python3 scripts/test-cloudflare-token.py` to test the token
2. Check token status in Cloudflare Dashboard
3. Verify token permissions match the requirements above
4. Create a new token if needed

### Operations Fail with 401/403 Errors

**Cause**: Token lacks required permissions for the operation.

**Solution**:
1. Check the error message for the specific permission needed
2. Update your token permissions in Cloudflare Dashboard
3. Or create a new token with all required permissions
4. Update the secret using `wrangler secret put` or the management script

### User-Level Operations Fail

**Cause**: `CLOUDFLARE_USER_TOKEN` is not set or lacks permissions.

**Solution**:
1. Create a user-scoped token with "API Tokens: Edit" permission
2. Add it as `CLOUDFLARE_USER_TOKEN`
3. Deploy the secret to your environment

## Security Best Practices

1. **Rotate tokens regularly**: Create new tokens and revoke old ones periodically
2. **Use minimal permissions**: Only grant permissions that are actually needed
3. **Set expiration dates**: Use TTL to limit token lifetime
4. **Monitor token usage**: Check Cloudflare audit logs for suspicious activity
5. **Never commit tokens**: Keep `.dev.vars` in `.gitignore`
6. **Use separate tokens per environment**: Different tokens for dev, staging, production
7. **Revoke compromised tokens immediately**: If a token is exposed, revoke it ASAP

## References

- [Cloudflare API Tokens Documentation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Wrangler Secrets](https://developers.cloudflare.com/workers/wrangler/commands/#secret)

