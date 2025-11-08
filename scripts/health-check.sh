#!/bin/bash
# Health check script for the Cloudflare Management API

# Exit immediately if a command exits with a non-zero status.
set -e

# Load environment variables from .dev.vars if it exists
if [ -f .dev.vars ]; then
  source .dev.vars
fi

echo "CLIENT_AUTH_TOKEN: $CLIENT_AUTH_TOKEN"

# Check for required environment variables
if [ -z "$CLIENT_AUTH_TOKEN" ]; then
  echo "Error: CLIENT_AUTH_TOKEN is not set. Please set it in your environment or a .dev.vars file."
  exit 1
fi

if [ -z "$WORKER_URL" ]; then
  echo "Error: WORKER_URL is not set. Please set it in your environment or a .dev.vars file."
  echo "Example: WORKER_URL=\"https://core-cloudflare-manager-api.hacolby.workers.dev\""
  exit 1
fi

echo "Running health check against: $WORKER_URL"

# Run the health check
curl -X GET "$WORKER_URL/health/status" \
  -H "Content-Type: application/json" \
  --fail --silent --show-error | jq .

echo "Health check complete."
