# Secrets Management Scripts

This directory contains scripts for managing Cloudflare Worker secrets across environments.

## Scripts

### 1. `manage-secrets.py`

Sync secrets from `.dev.vars` to Cloudflare Worker environments using Wrangler.

#### Features

- ✅ Load secrets from `.dev.vars`
- ✅ Sync to multiple environments (default, production, staging, etc.)
- ✅ Sync all secrets or specific keys
- ✅ Color-coded output with progress indicators
- ✅ Error handling and retry logic
- ✅ Masked secret values in output for security

#### Usage

```bash
# List all secrets from .dev.vars
python3 scripts/manage-secrets.py --list

# Sync all secrets to production
python3 scripts/manage-secrets.py --env production

# Sync all secrets to multiple environments
python3 scripts/manage-secrets.py --env default production staging

# Sync all secrets to all environments (shorthand)
python3 scripts/manage-secrets.py --all

# Sync specific secrets to production
python3 scripts/manage-secrets.py --env production --keys CLOUDFLARE_ACCOUNT_TOKEN CLOUDFLARE_USER_TOKEN

# Sync specific secrets to all environments
python3 scripts/manage-secrets.py --all --keys CLIENT_AUTH_TOKEN CLOUDFLARE_ACCOUNT_ID
```

#### Options

- `--list`, `-l`: List all secrets from `.dev.vars` (masked for security)
- `--env ENV [ENV ...]`, `-e`: Specify one or more environments to sync to
- `--all`, `-a`: Sync to all environments (default + production)
- `--keys KEY [KEY ...]`, `-k`: Sync only specific secret keys (default: all)
- `--help`, `-h`: Show help message

#### Examples

**Example 1: Initial Setup**

```bash
# First, list secrets to verify they're loaded correctly
python3 scripts/manage-secrets.py --list

# Then sync all secrets to production
python3 scripts/manage-secrets.py --env production
```

**Example 2: Update Specific Secrets**

```bash
# After updating tokens in .dev.vars, sync just those tokens
python3 scripts/manage-secrets.py --all --keys CLOUDFLARE_ACCOUNT_TOKEN CLOUDFLARE_USER_TOKEN
```

**Example 3: Multi-Environment Deployment**

```bash
# Sync all secrets to dev, staging, and production
python3 scripts/manage-secrets.py --env default staging production
```

#### Output

```
Cloudflare Worker Secrets Manager
Project: core-cloudflare-management-api
Environments: production
Keys: All (7 secrets)

======================================================================
Syncing to: production
======================================================================

  Uploading CLOUDFLARE_ACCOUNT_TOKEN... ✓
  Uploading CLOUDFLARE_USER_TOKEN... ✓
  Uploading CLIENT_AUTH_TOKEN... ✓
  Uploading CLOUDFLARE_ACCOUNT_ID... ✓
  Uploading WORKER_URL... ✓
  Uploading BASE_URL... ✓
  Uploading CLOUDFLARE_TOKEN... ✓

  Success: 7 | Failed: 0

======================================================================
Final Summary
======================================================================

Environments: 1
Secrets per environment: 7
Total Success: 7
Total Failed: 0

✓ All secrets synced successfully!
```

#### Requirements

- Python 3.6+
- `wrangler` CLI installed and authenticated
- `.dev.vars` file in project root
- `wrangler.jsonc` configured with environments

### 2. `test-cloudflare-token.py`

Test Cloudflare API tokens with safe, read-only operations.

#### Features

- ✅ Test token validity
- ✅ Test account access
- ✅ Test Workers, D1, KV, AI permissions
- ✅ Test user-level permissions
- ✅ Color-coded output with detailed results
- ✅ Safe, read-only operations only

#### Usage

```bash
# Test the token from .dev.vars
python3 scripts/test-cloudflare-token.py
```

#### Output

```
Cloudflare API Token Tester
Testing token: FgkMAjpQkz...Fd6NWTl6x4
Account ID: b3304b14848de15c72c24a14b0cd187d
Started at: 2025-11-13 16:11:04

======================================================================
Test 1: Token Verification
======================================================================

✓ PASS Token Verification
     Token ID: abc123, Status: active

======================================================================
Test 2: Account Access
======================================================================

✓ PASS List Accounts
     Found 1 account(s): Your Account Name

======================================================================
Test 3: Workers Scripts Access
======================================================================

✓ PASS List Workers Scripts
     Found 396 script(s): worker-1, worker-2, worker-3, ...

======================================================================
Test 4: D1 Database Access
======================================================================

✓ PASS List D1 Databases
     Found 100 database(s): db-1, db-2, db-3

======================================================================
Test 5: KV Storage Access
======================================================================

✓ PASS List KV Namespaces
     Found 20 namespace(s): kv-1, kv-2, kv-3

======================================================================
Test 6: Workers AI Access
======================================================================

✓ PASS List AI Models
     Found 84 model(s): @cf/meta/llama-2-7b-chat-int8, ...

======================================================================
Test 7: API Tokens Read Access
======================================================================

✗ FAIL List API Tokens
     Error 9109: Valid user-level authentication not found

======================================================================
Test Summary
======================================================================

Total Tests: 7
Passed: 6
Failed: 1
Success Rate: 85.7%

Failed Tests:
  ✗ List API Tokens: Error 9109: Valid user-level authentication not found
```

#### Requirements

- Python 3.6+
- `requests` library: `pip3 install requests`
- `.dev.vars` file with `CLOUDFLARE_TOKEN` or `CLOUDFLARE_ACCOUNT_TOKEN`

## Environment Setup

### `.dev.vars` Format

```bash
# Required
CLIENT_AUTH_TOKEN="your-auth-token"
CLOUDFLARE_ACCOUNT_ID="your-account-id"
WORKER_URL="https://your-worker.workers.dev"
BASE_URL="https://your-worker.workers.dev"

# Tokens
CLOUDFLARE_ACCOUNT_TOKEN="your-account-token"
CLOUDFLARE_USER_TOKEN="your-user-token"

# Optional (legacy)
CLOUDFLARE_TOKEN="your-legacy-token"
```

### Wrangler Configuration

Ensure your `wrangler.jsonc` has environments configured:

```jsonc
{
  "name": "core-cloudflare-manager-api",
  "main": "src/index.ts",
  // ... other config ...
  "env": {
    "production": {
      "name": "core-cloudflare-manager-api-production",
      // ... production config ...
    },
    "staging": {
      "name": "core-cloudflare-manager-api-staging",
      // ... staging config ...
    }
  }
}
```

## Troubleshooting

### "wrangler: command not found"

**Solution**: Install Wrangler globally:
```bash
npm install -g wrangler
```

### "No .dev.vars file found"

**Solution**: Create a `.dev.vars` file in the project root with your secrets.

### "Authentication error" from Wrangler

**Solution**: Authenticate Wrangler:
```bash
wrangler login
```

### Secrets not syncing

**Solution**: 
1. Check that Wrangler is authenticated: `wrangler whoami`
2. Verify environment names match your `wrangler.jsonc`
3. Check for typos in secret keys
4. Try syncing one secret at a time to isolate the issue

### Python dependencies missing

**Solution**: Install required packages:
```bash
pip3 install requests
```

## Security Notes

1. **Never commit `.dev.vars`**: Ensure it's in `.gitignore`
2. **Rotate secrets regularly**: Update tokens and re-sync periodically
3. **Use environment-specific tokens**: Different tokens for dev vs production
4. **Monitor secret access**: Check Cloudflare audit logs
5. **Revoke compromised secrets immediately**: If a secret is exposed, revoke and replace it

## CI/CD Integration

You can use these scripts in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Sync secrets to production
  run: |
    echo "$DEV_VARS" > .dev.vars
    python3 scripts/manage-secrets.py --env production
  env:
    DEV_VARS: ${{ secrets.DEV_VARS }}
```

## References

- [Wrangler Secrets Documentation](https://developers.cloudflare.com/workers/wrangler/commands/#secret)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Token Setup Guide](../docs/TOKEN_SETUP.md)

