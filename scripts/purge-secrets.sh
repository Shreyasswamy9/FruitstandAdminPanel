#!/usr/bin/env bash
set -euo pipefail

echo "==> Purging secrets from history and untracking .env"

# Current branch
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE="${1:-origin}"

# Stop tracking env files that commonly slip in
git rm -f --cached admin-server/.env 2>/dev/null || true
git rm -f --cached .env 2>/dev/null || true

# Ensure git-filter-repo is available
if command -v git-filter-repo >/dev/null 2>&1; then
  GFR="git-filter-repo"
elif git help -a | grep -q "filter-repo"; then
  GFR="git filter-repo"
else
  echo "ERROR: git-filter-repo not found."
  echo "Install via: pip install git-filter-repo"
  exit 1
fi

# Build a temporary replace-text rules file
TMP_RULES="$(mktemp)"
cat > "$TMP_RULES" <<'RULES'
# Replace known variable-based secrets by key
regex:^STRIPE_SECRET_KEY=.*==>STRIPE_SECRET_KEY=<redacted>
regex:^STRIPE_WEBHOOK_SECRET=.*==>STRIPE_WEBHOOK_SECRET=<redacted>
regex:^ADMIN_PASSWORD=.*==>ADMIN_PASSWORD=<redacted>
regex:^SUPABASE_SERVICE_ROLE_KEY=.*==>SUPABASE_SERVICE_ROLE_KEY=<redacted>
# Replace raw secret-looking tokens that may appear outside env files
regex:sk_live_[0-9A-Za-z]+==><redacted>
regex:sk_test_[0-9A-Za-z]+==><redacted>
regex:whsec_[0-9A-Za-z]+==><redacted>
RULES

# Rewrite history: remove specific file and scrub secrets everywhere
# Note: run both path removal and replace-text in a single pass
$GFR --force \
  --path admin-server/.env --invert-paths \
  --replace-text "$TMP_RULES"

rm -f "$TMP_RULES" || true

# Prune backup refs created by filter-repo (refs/original) and GC
echo "==> Cleaning backup refs and running GC"
git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive || true

# Stage any ignore/template changes the repo might have (if you added them)
git add -A
git commit -m "chore(security): purge secrets from history and stop tracking env files" || true

echo "==> Force pushing rewritten history to $REMOTE/$BRANCH"
git push "$REMOTE" "$BRANCH" --force-with-lease

cat <<'NEXT'
Done.

Important next steps:
- Rotate any exposed secrets in their providers (Stripe Dashboard, Supabase).
- Ensure admin-server/.env is git-ignored and never committed.
- If collaborators pulled the old history, they must run:
    git fetch --all
    git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)
NEXT

