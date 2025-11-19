# FixIt: Token Middleware Patch

## Problem Statement

The Cloudflare Worker was experiencing authentication failures on `/api/tokens` routes due to incorrect token usage:

- **Symptom**: 403 errors (Code: 9109) and 401 responses when accessing `/api/tokens` and `/api/tokens/verify`
- **Root Cause**: All API routes were using `CLOUDFLARE_TOKEN` (account-level token)
- **Issue**: The `/user/tokens/*` endpoints require `CLOUDFLARE_USER_TOKEN` (user-level token) for authentication

## Solution

Implement conditional token selection in the `apiClientMiddleware` based on the request path:

- Routes starting with `/api/tokens` → Use `CLOUDFLARE_USER_TOKEN`
- All other routes → Use `CLOUDFLARE_TOKEN`

## Implementation

### Patched Middleware Code

```typescript
const apiClientMiddleware = async (c: any, next: any) => {
  const urlPath = new URL(c.req.url).pathname;
  const isUserTokenRoute = urlPath.startsWith('/api/tokens');

  const apiToken = isUserTokenRoute
    ? c.env.CLOUDFLARE_USER_TOKEN
    : c.env.CLOUDFLARE_TOKEN;

  if (!apiToken) {
    const missingVar = isUserTokenRoute
      ? 'CLOUDFLARE_USER_TOKEN'
      : 'CLOUDFLARE_TOKEN';
    return c.json({ success: false, error: `${missingVar} is not configured` }, 500);
  }

  if (!c.get('apiClient')) {
    const apiClient = new CloudflareApiClient({ apiToken });
    c.set('apiClient', apiClient);
  }

  await next();
};
```

### Key Changes

1. **Path Detection**: Extracts the URL pathname and checks if it starts with `/api/tokens`
2. **Conditional Token Selection**: Uses ternary operator to select the appropriate token
3. **Error Handling**: Provides specific error messages indicating which environment variable is missing
4. **Backwards Compatibility**: All existing routes continue to work with `CLOUDFLARE_TOKEN`

## Testing Verification

After applying this patch, verify the following:

### User Token Routes (should use CLOUDFLARE_USER_TOKEN)
- ✓ `GET /api/tokens` - List user tokens
- ✓ `GET /api/tokens/verify` - Verify current token
- ✓ `POST /api/tokens` - Create new token
- ✓ `DELETE /api/tokens/:id` - Delete token

### Account Token Routes (should use CLOUDFLARE_TOKEN)
- ✓ `GET /api/workers` - List workers
- ✓ `GET /api/workers/:name` - Get worker details
- ✓ `POST /api/workers` - Create/deploy worker
- ✓ `GET /api/storage/kv/namespaces` - List KV namespaces
- ✓ `GET /api/storage/r2/buckets` - List R2 buckets
- ✓ `GET /api/storage/d1/databases` - List D1 databases

## Environment Configuration

Ensure both tokens are configured in your Worker environment:

```bash
# Set in Wrangler or Cloudflare Dashboard
CLOUDFLARE_TOKEN=<account-level-token>
CLOUDFLARE_USER_TOKEN=<user-level-token>
```

## API Documentation Alignment

This fix aligns with Cloudflare API requirements:
- **User Token API** (`/user/tokens/*`): Requires user-level authentication
- **Account Resources API** (`/accounts/:id/*`): Requires account-level authentication

## Related Files

- `src/index.ts` - Main middleware implementation (lines 74-86)
- `src/routes/api/apiClient.ts` - CloudflareApiClient that uses the token
- `src/routes/api/tokens.ts` - Token management routes

## Commit Message

```
fix: use CLOUDFLARE_USER_TOKEN for /api/tokens routes

- Add conditional token selection in apiClientMiddleware
- Routes starting with /api/tokens now use CLOUDFLARE_USER_TOKEN
- All other routes continue using CLOUDFLARE_TOKEN
- Improve error messages to specify which token is missing

Resolves: 403 (Code: 9109) errors on /api/tokens endpoints
```

## Reviewer Checklist

- [ ] Middleware correctly identifies `/api/tokens` routes
- [ ] `CLOUDFLARE_USER_TOKEN` is used for user token operations
- [ ] `CLOUDFLARE_TOKEN` is used for all other operations
- [ ] Error messages are clear and actionable
- [ ] No breaking changes to existing routes
- [ ] Environment variables are properly configured
- [ ] Tests pass for both token types
- [ ] API responses return 200 OK (not 403/401)

## Deployment Notes

1. Ensure `CLOUDFLARE_USER_TOKEN` is set in production environment
2. Deploy the updated Worker
3. Monitor logs for any authentication errors
4. Verify `/api/tokens` endpoints return 200 OK

---

**Status**: ✅ Patch Applied
**Date**: 2025-11-19
**Author**: Claude AI Developer Assistant
