#!/bin/bash
# Script to test Cloudflare API token against both user and account endpoints

# Exit immediately if a command exits with a non-zero status.
set -e

# Load environment variables from .dev.vars if it exists
if [ -f .dev.vars ]; then
  source .dev.vars
fi

# Check for required environment variables
if [ -z "$CLOUDFLARE_TOKEN" ]; then
  echo "Error: CLOUDFLARE_TOKEN is not set. Please set it in your environment or a .dev.vars file."
  exit 1
fi

if [ -z "$CLIENT_AUTH_TOKEN" ]; then
  echo "Error: CLIENT_AUTH_TOKEN is not set. Please set it in your environment or a .dev.vars file."
  exit 1
fi

if [ -z "$WORKER_URL" ]; then
  echo "Error: WORKER_URL is not set. Please set it in your environment or a .dev.vars file."
  echo "Example: WORKER_URL=\"https://core-cloudflare-manager-api.hacolby.workers.dev\""
  exit 1
fi

echo "=========================================="
echo "Cloudflare Token Verification Test"
echo "=========================================="
echo "Worker URL: $WORKER_URL"
echo ""

echo "Test 1: Direct User Token Verification (Cloudflare API)"
echo "--------------------------------------------------------"
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -X GET \
  -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" \
  --fail --silent --show-error | jq .
echo ""

echo "Test 2: Comprehensive Token Test via Worker API"
echo "--------------------------------------------------------"
echo "Testing token against both user and account endpoints..."
curl "$WORKER_URL/api/tokens/test" \
  -X POST \
  -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$CLOUDFLARE_TOKEN\"}" \
  --fail --silent --show-error | jq .
echo ""

echo "Test 3: Simple Token Verify via Worker API"
echo "--------------------------------------------------------"
curl "$WORKER_URL/api/tokens/verify" \
  -X GET \
  -H "Authorization: Bearer $CLIENT_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --fail --silent --show-error | jq .
echo ""

echo "=========================================="
echo "Token verification tests complete."
echo "=========================================="
