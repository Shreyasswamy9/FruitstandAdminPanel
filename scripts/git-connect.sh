#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/git-connect.sh [REMOTE_URL]
#   PURGE=1 bash scripts/git-connect.sh   # runs purge-secrets before pushing
#
# Defaults to your repo URL if not provided.
REPO_URL="${1:-https://github.com/Shreyasswamy9/FruitstandAdminPanel.git}"
REMOTE_NAME="origin"
BRANCH="${BRANCH:-main}"

echo "==> Ensuring repository is initialized"
if [ ! -d .git ]; then
  git init
  # Put HEAD on main for new repos
  git symbolic-ref HEAD refs/heads/"$BRANCH" || true
fi

echo "==> Configuring remote '$REMOTE_NAME' => $REPO_URL"
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REPO_URL"
else
  git remote add "$REMOTE_NAME" "$REPO_URL"
fi

# Optional: authenticate with GitHub CLI (if installed)
if command -v gh >/dev/null 2>&1; then
  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI not authenticated. Run: gh auth login"
  fi
fi

echo "==> Fetching remote"
git fetch "$REMOTE_NAME" --prune

# Determine current branch; if detached, check out main
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD || echo 'HEAD')"
if [ "$CURRENT_BRANCH" = "HEAD" ]; then
  echo "==> Checking out branch $BRANCH"
  git checkout -B "$BRANCH"
else
  BRANCH="$CURRENT_BRANCH"
fi

# Stop tracking common offenders before push (safe no-ops if not tracked)
echo "==> Cleaning index of env and node_modules (if any tracked)"
git rm -r --cached admin-server/node_modules 2>/dev/null || true
git rm -r --cached node_modules 2>/dev/null || true
git rm -f --cached admin-server/.env .env 2>/dev/null || true

# Optional purge for push protection
if [ "${PURGE:-0}" = "1" ]; then
  echo "==> Running purge-secrets.sh before push"
  bash "$(dirname "$0")/purge-secrets.sh"
fi

# Ensure upstream
echo "==> Setting upstream to $REMOTE_NAME/$BRANCH (if exists)"
if git ls-remote --exit-code --heads "$REMOTE_NAME" "$BRANCH" >/dev/null 2>&1; then
  git branch --set-upstream-to="$REMOTE_NAME/$BRANCH" "$BRANCH" || true
fi

echo "==> Pushing branch $BRANCH"
git push "$REMOTE_NAME" "$BRANCH" -u --force-with-lease || {
  echo "Push failed. If blocked by push protection, run: PURGE=1 bash scripts/git-connect.sh"
  exit 1
}

echo "Done. Branch '$BRANCH' is connected to $REMOTE_NAME."
