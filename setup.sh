#!/usr/bin/env bash
#
# Tikjap AI — one-shot local setup.
#
#   chmod +x setup.sh
#   ./setup.sh
#
# Installs dependencies, creates .env.local from the example if missing,
# and runs the verification suite (typecheck, lint, tests, production build).
# Pass --quick to skip verification and just get a working install.

set -euo pipefail

cd "$(dirname "$0")"

QUICK=0
[[ "${1:-}" == "--quick" ]] && QUICK=1

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$1" >&2; exit 1; }

step "Checking prerequisites"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 20 or newer: https://nodejs.org"
command -v npm  >/dev/null 2>&1 || fail "npm is not installed (it ships with Node.js)."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  fail "Node 20 or newer is required (found $(node -v))."
fi
echo "node $(node -v), npm v$(npm -v)"

step "Installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

step "Configuring environment"
if [[ -f .env.local ]]; then
  echo ".env.local already exists — leaving it untouched."
else
  cp .env.example .env.local
  echo "Created .env.local from .env.example (demo mode)."
fi

if (( QUICK )); then
  step "Skipping verification (--quick)"
else
  step "Typechecking"
  npm run typecheck

  step "Linting"
  npm run lint

  step "Running tests"
  npm test

  step "Building"
  npm run build
fi

cat <<'DONE'

Setup complete.

  npm run dev     start the dev server on http://localhost:3000
  npm start       serve the production build

Demo accounts:
  user   demo@tikjap.dev  / demo1234
  admin  admin@tikjap.dev / admin1234
DONE
