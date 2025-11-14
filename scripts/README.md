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

## extract-pr-comments.py

Extracts all code comments from the current open PR using GitHub CLI.

### Usage

```bash
# Extract comments from current open PR
python scripts/extract-pr-comments.py

# Or make executable and run directly
chmod +x scripts/extract-pr-comments.py
./scripts/extract-pr-comments.py
```

### What it does

1. Uses GitHub CLI to find the current open PR
2. Extracts all code comments with file paths and line numbers
3. Saves comments to `pr_{number}_comments.txt`

### Requirements

- **GitHub CLI (gh)** installed and authenticated
- **Python 3.x**
- **Open PR** in the current repository
- **Authenticated** with `gh auth login`

### Example Output

```
🚀 PR Comments Extractor
==============================
🔍 Finding open PR...
✅ Found open PR #123: feat: add new feature
📝 Extracting comments from PR #123...
✅ Found 5 comments
💾 Comments saved to: pr_123_comments.txt

📊 Summary:
   PR: #123 - feat: add new feature
   Repository: owner/repo
   Comments: 5
   Output file: pr_123_comments.txt
```

### Output Format

The output file contains comments in this format:
```
PR #123: feat: add new feature
Repository: owner/repo
==================================================

.cursor/rules/unit-test-safety.mdc:15 - This rule looks good, but consider adding more examples.
/src/index.ts:42 - Remove the console.log before merging.
/README.md:25 - Update this section to reflect the new API.
```

### Notes

- Automatically detects the current repository from git remote
- Works with both HTTPS and SSH git URLs
- Uses GitHub CLI pagination to handle large PRs
- Comments are saved with file:line format for easy reference

