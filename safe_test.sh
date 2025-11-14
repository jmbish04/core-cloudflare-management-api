#!/usr/bin/env bash

# safe_test.sh — standardized curl-based test wrapper

URL="${1:-http://127.0.0.1:8787/health/unit-tests}"

CONNECT_TIMEOUT=5

MAX_TIME=20

echo "Running safe test on $URL (max ${MAX_TIME}s)..."

output=$(curl --connect-timeout $CONNECT_TIMEOUT --max-time $MAX_TIME -sf "$URL")
if [ $? -ne 0 ] || ! echo "$output" | jq -e '.result[0]' > /dev/null; then
    echo "⚠️ No response within ${MAX_TIME}s or invalid JSON / missing .result[0]" >&2
    exit 1
fi
echo "$output" | jq '.result[0]'

