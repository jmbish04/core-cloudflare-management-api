# Token Manager Service

The Token Manager Service provides automated token health monitoring and self-healing capabilities for Cloudflare API tokens used by the worker.

---

## Overview

This service ensures that both the **Account Token** (`CLOUDFLARE_ACCOUNT_TOKEN`) and **User Token** (`CLOUDFLARE_USER_TOKEN`) always have the correct permissions needed for the worker to function properly.

### Key Features

- ✅ **Automated Health Checks**: Validates tokens every 6 hours
- ✅ **Self-Healing**: Automatically adds missing permissions
- ✅ **Permission Validation**: Ensures all required permissions are present
- ✅ **Expiration Monitoring**: Alerts when tokens are close to expiring
- ✅ **Historical Tracking**: Logs all health checks to database
- ✅ **API Endpoints**: Manual health checks and healing via REST API
- ✅ **Cron Integration**: Runs automatically on schedule

---

## Required Permissions

### Account Token

The account token needs these permissions to manage Cloudflare resources:

- Workers Scripts: Edit
- Workers KV Storage: Edit
- D1: Edit
- Workers R2 Storage: Edit
- Workers AI: Edit
- AI Gateway: Edit
- Queues: Edit
- Vectorize: Edit
- Hyperdrive: Edit
- Workers Tail: Read
- Cloudflare Pages: Edit
- Cloudflare Images: Edit
- Cloudflare Tunnel: Edit
- Workers Analytics Engine: Edit

### User Token

The user token needs these permissions for user-level operations:

- API Tokens: Edit

---

## API Endpoints

### 1. GET `/tokens/health`

Check the health of both tokens.

**Query Parameters**:
- `auto_heal` (optional): Set to `true` to automatically heal tokens

**Example**:
```bash
# Check health only
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/health

# Check health and auto-heal
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/health?auto_heal=true
```

**Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2025-11-13T19:00:00.000Z",
    "account_token": {
      "token_type": "account",
      "token_id": "4d841f1aa61bc019800506e138085f66",
      "is_valid": true,
      "is_active": true,
      "expires_on": null,
      "missing_permissions": [],
      "has_all_permissions": true,
      "verification_url": "https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/verify"
    },
    "user_token": {
      "token_type": "user",
      "token_id": "a753e62f6ffe44a7762befbce7a9eddf",
      "is_valid": true,
      "is_active": true,
      "expires_on": null,
      "missing_permissions": [],
      "has_all_permissions": true,
      "verification_url": "https://api.cloudflare.com/client/v4/user/tokens/verify"
    },
    "overall_health": "healthy",
    "recommendations": [
      "✅ All tokens are healthy and have required permissions."
    ],
    "auto_heal_attempted": false
  }
}
```

### 2. POST `/tokens/heal`

Attempt to auto-heal both tokens by adding missing permissions.

**Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/heal
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully healed all tokens",
  "data": {
    "timestamp": "2025-11-13T19:00:00.000Z",
    "account_token": { /* ... */ },
    "user_token": { /* ... */ },
    "overall_health": "healthy",
    "recommendations": [ /* ... */ ],
    "auto_heal_attempted": true,
    "auto_heal_results": {
      "account_token": {
        "success": true,
        "token_type": "account",
        "token_id": "4d841f1aa61bc019800506e138085f66",
        "permissions_added": [
          "com.cloudflare.api.account.workers.script:edit",
          "com.cloudflare.api.account.d1:edit"
        ],
        "permissions_already_present": [],
        "message": "Successfully added 2 missing permissions"
      },
      "user_token": {
        "success": true,
        "token_type": "user",
        "token_id": "a753e62f6ffe44a7762befbce7a9eddf",
        "permissions_added": [],
        "permissions_already_present": [],
        "message": "Successfully added 0 missing permissions"
      }
    }
  }
}
```

### 3. GET `/tokens/status`

Quick status check (no auto-heal, minimal response).

**Example**:
```bash
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/status
```

**Response**:
```json
{
  "success": true,
  "data": {
    "overall_health": "healthy",
    "account_token": {
      "is_valid": true,
      "is_active": true,
      "has_all_permissions": true,
      "missing_permissions_count": 0
    },
    "user_token": {
      "is_valid": true,
      "is_active": true,
      "has_all_permissions": true,
      "missing_permissions_count": 0
    },
    "recommendations": [
      "✅ All tokens are healthy and have required permissions."
    ]
  }
}
```

### 4. GET `/tokens/history`

Get token health check history.

**Query Parameters**:
- `limit` (optional): Number of records to return (default: 10)

**Example**:
```bash
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/history?limit=20
```

**Response**:
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "timestamp": "2025-11-13T19:00:00.000Z",
        "overall_health": "healthy",
        "account_token_valid": true,
        "account_token_has_all_perms": true,
        "account_token_missing_perms": 0,
        "user_token_valid": true,
        "user_token_has_all_perms": true,
        "user_token_missing_perms": 0,
        "auto_heal_attempted": true,
        "auto_heal_success": true
      }
      // ... more history entries
    ],
    "count": 20
  }
}
```

---

## Automated Cron Jobs

The Token Manager runs automatically on a schedule:

### Schedule

**Every 6 hours** (`0 */6 * * *`):
- Checks health of both tokens
- Automatically heals tokens if permissions are missing
- Logs results to database
- Outputs detailed logs

**Also runs daily** (`0 0 * * *`):
- Same as above, plus runs alongside other daily tasks

### Cron Output

```
Scheduled task started at 2025-11-13T19:00:00.000Z for cron '0 */6 * * *'
Running token health check and auto-heal...
Token health check completed. Overall: healthy
Account token: ✅ valid, ✅ all permissions
User token: ✅ valid, ✅ all permissions
Recommendations:
  ✅ All tokens are healthy and have required permissions.
```

### If Healing is Needed

```
Running token health check and auto-heal...
Token health check completed. Overall: degraded
Account token: ✅ valid, ⚠️ all permissions
User token: ✅ valid, ✅ all permissions
Account token heal: ✅ Successfully added 2 missing permissions
  Added permissions: com.cloudflare.api.account.workers.script:edit, com.cloudflare.api.account.d1:edit
Recommendations:
  ✅ Account token permissions updated successfully
```

---

## Health States

### Healthy ✅

- Both tokens are valid and active
- Both tokens have all required permissions
- No action needed

### Degraded ⚠️

- Tokens are valid and active
- One or both tokens are missing some permissions
- Auto-heal will attempt to add missing permissions

### Unhealthy ❌

- One or both tokens are invalid or inactive
- Manual intervention required
- Auto-heal cannot fix invalid tokens

---

## How Self-Healing Works

1. **Validation**: Service verifies each token using its specific endpoint
2. **Permission Check**: Compares current permissions with required permissions
3. **Missing Permissions**: Identifies any missing permissions
4. **Auto-Heal**: If enabled, attempts to add missing permissions
5. **Update Token**: Uses Cloudflare API to update token policies
6. **Verification**: Confirms permissions were added successfully
7. **Logging**: Records all actions to database

### Limitations

- ✅ Can add missing permissions to existing tokens
- ❌ Cannot fix invalid or revoked tokens
- ❌ Cannot extend token expiration dates
- ❌ Cannot create new tokens automatically

---

## Manual Healing

If auto-heal fails or you need to manually intervene:

### 1. Check Token Status

```bash
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/status
```

### 2. Attempt Manual Heal

```bash
curl -X POST \
  -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/heal
```

### 3. If Still Failing

1. Check token status in Cloudflare Dashboard
2. Verify token is active and not expired
3. Check token has permission to edit itself (API Tokens: Edit)
4. Create a new token if needed
5. Update secrets using `scripts/manage-secrets.py`

---

## Integration with Health Checks

The Token Manager integrates with the existing health check system:

### Dashboard Display

Token health is displayed on the main dashboard at `/`:
- Overall token health status
- Account token status
- User token status
- Recommendations

### Health Insights

Token issues are included in AI insights at `/health/insights`:
- Critical alerts for invalid tokens
- Warnings for missing permissions
- Recommendations for token rotation

### Monitoring

Token health is logged to `coach_telemetry` table:
- Event type: `token_health_check`
- Metadata includes all health metrics
- Queryable for historical analysis

---

## Testing

### Manual Test

```bash
# Test account token
python3 scripts/test-cloudflare-token.py

# Check token health via API
curl -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/health

# Trigger manual heal
curl -X POST \
  -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/tokens/heal
```

### Trigger Cron Manually

```bash
# Trigger the cron job locally
wrangler dev --test-scheduled

# Or deploy and trigger via Cloudflare Dashboard
# Workers > Your Worker > Triggers > Cron Triggers > Trigger
```

---

## Troubleshooting

### Token Validation Fails

**Problem**: `is_valid: false`

**Solutions**:
1. Check token exists in `.dev.vars` or production secrets
2. Verify token is active in Cloudflare Dashboard
3. Ensure token hasn't been revoked
4. Check token format (should be a long alphanumeric string)

### Missing Permissions Not Added

**Problem**: Auto-heal runs but permissions not added

**Solutions**:
1. Verify token has "API Tokens: Edit" permission
2. Check token can edit itself (user-level permission)
3. Review error message in heal response
4. Check Cloudflare API logs for rate limiting

### Cron Not Running

**Problem**: Token health checks not running automatically

**Solutions**:
1. Verify cron triggers in `wrangler.jsonc`
2. Check worker logs: `wrangler tail --env=production`
3. Manually trigger cron in Cloudflare Dashboard
4. Ensure worker is deployed to production

### Health Check Returns 500

**Problem**: `/tokens/health` returns 500 error

**Solutions**:
1. Check worker logs for error details
2. Verify both tokens are set in environment
3. Ensure `CLOUDFLARE_ACCOUNT_ID` is set
4. Check network connectivity to Cloudflare API

---

## Best Practices

1. **Monitor Regularly**: Check token health dashboard daily
2. **Review History**: Analyze token health trends weekly
3. **Rotate Tokens**: Create new tokens every 90 days
4. **Set Expiration**: Use token TTL for automatic rotation
5. **Least Privilege**: Only grant permissions actually needed
6. **Separate Tokens**: Use different tokens for different environments
7. **Audit Logs**: Review Cloudflare audit logs for token usage
8. **Alert on Failures**: Set up alerts for unhealthy token status

---

## Security Considerations

1. **Token Storage**: Tokens are stored as Wrangler secrets (encrypted)
2. **API Access**: Token endpoints require authentication
3. **Permission Updates**: Only adds permissions, never removes
4. **Audit Trail**: All changes logged to database
5. **No Token Exposure**: Token values never returned in API responses
6. **Rate Limiting**: Respects Cloudflare API rate limits
7. **Error Handling**: Fails gracefully without exposing sensitive data

---

## Future Enhancements

- [ ] Automatic token rotation with zero downtime
- [ ] Slack/email notifications for token issues
- [ ] Token usage analytics and reporting
- [ ] Multi-account token management
- [ ] Token permission templates
- [ ] Integration with secret rotation services
- [ ] Predictive expiration alerts
- [ ] Token health scoring system

---

## References

- [Token Setup Guide](TOKEN_SETUP.md)
- [Token Test Results](../TOKEN_TEST_RESULTS.md)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)

