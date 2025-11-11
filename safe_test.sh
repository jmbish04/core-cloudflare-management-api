#!/usr/bin/env bash

# safe_test.sh — standardized curl-based test wrapper

URL="${1:-http://127.0.0.1:8787/health/unit-tests}"

CONNECT_TIMEOUT=5

MAX_TIME=20

echo "Running safe test on $URL (max ${MAX_TIME}s)..."

curl --connect-timeout $CONNECT_TIMEOUT --max-time $MAX_TIME -sf "$URL" \
  | jq '.result[0]' 2>/dev/null \
  || echo "⚠️ No response within ${MAX_TIME}s or invalid JSON"

