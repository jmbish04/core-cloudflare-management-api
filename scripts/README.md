# Scripts

Utility scripts for managing the Cloudflare Worker.

## sync-secrets.sh

Syncs environment variables from `.dev.vars` to Cloudflare Worker secrets.

### Usage

```bash
# Sync to all environments (default + production)
./scripts/sync-secrets.sh

# Sync to specific environment only
./scripts/sync-secrets.sh production
./scripts/sync-secrets.sh default
```

### What it does

1. Reads all environment variables from `.dev.vars`
2. Uploads each variable as a secret using `wrangler secret put`
3. Reports success/failure for each upload

### Environments

- **default** - Development environment (no `--env` flag)
- **production** - Production environment (`--env=production`)

### Requirements

- `.dev.vars` file must exist in project root
- `npx wrangler` must be available
- Must be authenticated with Cloudflare (`wrangler login`)

### Example Output

```
Parsing .dev.vars...
  ✓ Found: CLIENT_AUTH_TOKEN
  ✓ Found: CLOUDFLARE_ACCOUNT_ID
  ✓ Found: WORKER_URL
  ✓ Found: CLOUDFLARE_TOKEN
Found 4 secrets

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Uploading secrets to: production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Uploading CLIENT_AUTH_TOKEN...
  ✓ CLIENT_AUTH_TOKEN uploaded

  Uploading CLOUDFLARE_ACCOUNT_ID...
  ✓ CLOUDFLARE_ACCOUNT_ID uploaded

  Success: 4 | Failed: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Secret sync complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Notes

- Secrets are encrypted and stored securely by Cloudflare
- `.dev.vars` is gitignored and should never be committed
- The script skips comments (lines starting with `#`) and empty lines
- Values are automatically unquoted before upload

