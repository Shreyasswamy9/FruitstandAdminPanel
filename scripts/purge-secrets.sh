#!/usr/bin/env bash
set -euo pipefail

# Ensure .env is not tracked anymore
git rm -f --cached admin-server/.env || true

# Remove the file from entire history (requires git-filter-repo)
if ! command -v git-filter-repo >/dev/null 2>&1 && ! command -v git filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install it first:"
  echo "  pip install git-filter-repo"
  exit 1
fi

# Run filter-repo (works whether command is git-filter-repo or git filter-repo)
git filter-repo --path admin-server/.env --invert-paths

# Commit ignore and example env if needed
git add -A
git commit -m "chore(security): remove .env from history, add .env.example and ignore .env" || true

# Force push with lease to update remote (warn collaborators first)
git push --force-with-lease
