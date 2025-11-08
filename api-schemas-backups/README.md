# API Schema Backups

This directory contains historical versions of the Cloudflare API schemas.

## Structure

Each backup is stored in a directory named with the date and time it was retired:
- Format: `api-schemas-YYYY-MM-DD_HH-MM-SS/`
- Example: `api-schemas-2024-11-07_20-30-45/`

## Contents

Each backup directory contains:
- `openapi.json` - Full OpenAPI 3.1 specification
- `openapi.yaml` - YAML format
- `common.yaml` - Common schema definitions
- `.backup-metadata.txt` - Commit information from the original repository

## Usage

To reference a previous version:
```bash
# View a specific backup
cat api-schemas-backups/api-schemas-2024-11-07_20-30-45/openapi.json

# Compare current with a backup
diff api-schemas-main/openapi.json api-schemas-backups/api-schemas-2024-11-07_20-30-45/openapi.json
```

## Cleanup

To remove old backups (optional):
# First, perform a dry run to see which backups will be deleted:
find api-schemas-backups -type d -name "api-schemas-*" -mtime +30

# If the list is correct, run the following command to delete them:
find api-schemas-backups -type d -name "api-schemas-*" -mtime +30 -exec rm -rf {} +

