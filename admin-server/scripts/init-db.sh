#!/usr/bin/env bash
set -euo pipefail

# Run from project root: bash admin-server/scripts/init-db.sh
echo "Initializing Prisma schema (prisma db push)..."
cd "$(dirname "$0")/.."
# Ensure node_modules/bin available (use npx to be safe)
npx prisma generate
npx prisma db push --accept-data-loss
echo "Prisma schema pushed. Prisma client generated."
