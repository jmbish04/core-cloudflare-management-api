#!/bin/bash

# Script to sync secrets from .dev.vars to all Wrangler environments
# Usage: ./scripts/sync-secrets.sh [environment]
# If no environment is specified, syncs to all environments

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_VARS_FILE="$PROJECT_ROOT/.dev.vars"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .dev.vars exists
if [ ! -f "$DEV_VARS_FILE" ]; then
    echo -e "${RED}Error: .dev.vars file not found at $DEV_VARS_FILE${NC}"
    exit 1
fi

# Create temporary file to store secrets
TEMP_SECRETS=$(mktemp)
trap "rm -f $TEMP_SECRETS" EXIT

# Parse .dev.vars and extract key-value pairs
echo -e "${BLUE}Parsing .dev.vars...${NC}"
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    if [[ -z "$key" ]] || [[ "$key" =~ ^#.* ]] || [[ "$key" =~ ^[[:space:]]*$ ]]; then
        continue
    fi
    
    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Remove quotes from value
    value="${value%\"}"
    value="${value#\"}"
    
    # Store in temp file
    echo "$key=$value" >> "$TEMP_SECRETS"
    echo -e "  ${GREEN}✓${NC} Found: $key"
done < "$DEV_VARS_FILE"

# Check if any secrets were found
SECRET_COUNT=$(wc -l < "$TEMP_SECRETS" | xargs)
if [ "$SECRET_COUNT" -eq 0 ]; then
    echo -e "${RED}Error: No secrets found in .dev.vars${NC}"
    exit 1
fi

echo -e "${BLUE}Found $SECRET_COUNT secrets${NC}"
echo ""

# Function to upload secrets to a specific environment
upload_secrets() {
    local env=$1
    local env_flag=""
    local env_display="$env"
    
    if [ "$env" != "default" ]; then
        env_flag="--env=$env"
    else
        env_display="default (dev)"
    fi
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Uploading secrets to: ${env_display}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    local success_count=0
    local fail_count=0
    
    while IFS='=' read -r key value; do
        echo "  Uploading ${BLUE}$key${NC}..."
        
        # Use echo to pipe the value to wrangler secret put
        if echo "$value" | npx wrangler secret put "$key" $env_flag 2>&1 | grep -q "Success"; then
            echo -e "  ${GREEN}✓ $key uploaded${NC}"
            ((success_count++))
        else
            echo -e "  ${RED}✗ $key failed${NC}"
            ((fail_count++))
        fi
        echo ""
    done < "$TEMP_SECRETS"
    
    echo ""
    echo -e "  ${GREEN}Success: $success_count${NC} | ${RED}Failed: $fail_count${NC}"
    echo ""
}

# Determine which environments to sync
if [ $# -eq 0 ]; then
    # No arguments - sync to all environments
    echo -e "${YELLOW}No environment specified. Syncing to all environments...${NC}"
    echo ""
    
    # Default environment (no --env flag)
    upload_secrets "default"
    
    # Production environment
    upload_secrets "production"
    
    # Add more environments here if needed
    # upload_secrets "staging"
    
else
    # Specific environment provided
    upload_secrets "$1"
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Secret sync complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
