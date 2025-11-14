#!/usr/bin/env bash

set -euo pipefail

# Ensure we're at the repository root.
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Cleaning transient artefacts…"
rm -rf .wrangler/tmp playwright-report test-results
find "$repo_root" -name '.DS_Store' -delete

echo "Staging reliability framework changes…"
git add \
  package.json \
  package-lock.json \
  migrations/0004_silky_whistler.sql \
  migrations/0005_strong_xorn.sql \
  migrations/0006_resilient_unit_tests.sql \
  migrations/0007_add_healing_steps_and_effectiveness.sql \
  migrations/meta/_journal.json \
  migrations/meta/0005_snapshot.json \
  migrations/meta/0006_snapshot.json \
  migrations/meta/0007_snapshot.json \
  public/app.js \
  public/health.html \
  public/index.html \
  public/nav.html \
  src/db/client.ts \
  src/db/kysely.ts \
  src/db/schema.ts \
  src/index.ts \
  src/routes/health.ts \
  src/routes/api/cicd.ts \
  src/routes/flows/cicd.ts \
  src/routes/flows/deploy.ts \
  src/routes/flows/health.ts \
  src/routes/flows/index.ts \
  src/routes/flows/project.ts \
  src/routes/flows/token.ts \
  src/routes/flows/github-deploy.ts \
  src/services/health-check.ts \
  src/services/self-healing.ts \
  src/services/unit-tests.ts \
  src/utils/deploy.ts \
  tests \
  playwright.config.ts

echo
git status -sb

echo
read -rp "Press enter to commit and push, or Ctrl+C to abort…"

git commit -m "Add automated reliability suite and deployment guardrails"
git push
