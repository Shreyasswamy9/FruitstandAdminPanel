#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/shreyasswamy/Desktop/FruitstandAdminPanel"

cd "$REPO_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Please commit or stash before running init-db."
  git status --short
  exit 1
fi

git remote prune origin
git fetch --force origin main

git branch --force main origin/main
git checkout main

git status --short --branch