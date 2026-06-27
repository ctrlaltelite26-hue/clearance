#!/usr/bin/env bash
# Push web env vars to an existing Vercel project (deploys still via GitHub).
#
# One-time setup:
#   npm i -g vercel && vercel login
#   pnpm vercel:link
#
# Usage:
#   pnpm vercel:env              # production (default)
#   pnpm vercel:env:preview      # preview
#   pnpm vercel:env:all          # production + preview + development
#   pnpm vercel:env -- --dry-run # print values, don't push

set -euo pipefail

TARGET="production"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: pnpm vercel:env [-- <target>|--dry-run]

Targets:
  production   (default)
  preview
  development
  all          push to production, preview, and development

Examples:
  pnpm vercel:env
  pnpm vercel:env:preview
  pnpm vercel:env:all
  pnpm vercel:env -- --dry-run
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    production|preview|development|all) TARGET="$arg" ;;
    *) echo "Unknown argument: $arg"; usage; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
ENV_FILE="$ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$ROOT/.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env.local or .env found at repo root."
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Install Vercel CLI: npm i -g vercel"
  exit 1
fi

read_env() {
  local file="$1" key="$2"
  local line val
  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  [ -n "$line" ] || return 0
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# Pick API URL for Vercel: explicit override → first https non-localhost in env files → prod default.
# .env.local often has NEXT_PUBLIC_API_URL twice (prod + localhost); tail -n 1 wrongly picked localhost.
resolve_api_url() {
  if [ -n "${VERCEL_API_URL:-}" ]; then
    printf '%s' "$VERCEL_API_URL"
    return
  fi

  local file url
  for file in "$ROOT/.env.local" "$ROOT/.env"; do
    [ -f "$file" ] || continue
    while IFS= read -r line; do
      [[ "$line" =~ ^NEXT_PUBLIC_API_URL= ]] || continue
      url="${line#NEXT_PUBLIC_API_URL=}"
      url="${url%\"}"; url="${url#\"}"
      url="${url%\'}"; url="${url#\'}"
      if [[ "$url" == https://* ]] && [[ "$url" != *localhost* ]] && [[ "$url" != *127.0.0.1* ]]; then
        printf '%s' "$url"
        return
      fi
    done < "$file"
  done

  if [ "$TARGET" = "development" ]; then
    read_env "$ROOT/.env.local" NEXT_PUBLIC_API_URL 2>/dev/null || read_env "$ROOT/.env" NEXT_PUBLIC_API_URL
    return
  fi

  printf '%s' "https://api.pulseiva.com"
}

API_URL="$(resolve_api_url)"

CLERK_PK="${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-$(read_env "$ENV_FILE" NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}"
CLERK_PK="${CLERK_PK:-$(read_env "$ENV_FILE" CLERK_PUBLISHABLE_KEY)}"
CLERK_SK="${CLERK_SECRET_KEY:-$(read_env "$ENV_FILE" CLERK_SECRET_KEY)}"

if [ -z "$CLERK_PK" ] || [ -z "$CLERK_SK" ]; then
  echo "Missing Clerk keys in $ENV_FILE"
  echo "Need NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY"
  exit 1
fi

cd "$WEB"

if [ ! -f .vercel/project.json ]; then
  echo "Vercel project not linked."
  echo "Run once: pnpm vercel:link"
  exit 1
fi

PROJECT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).projectId)")
echo "Project: $PROJECT"
echo "API URL: $API_URL"

dupes=$(grep -cE '^NEXT_PUBLIC_API_URL=' "$ROOT/.env.local" 2>/dev/null || echo 0)
if [ "${dupes:-0}" -gt 1 ]; then
  echo "Note: .env.local has $dupes NEXT_PUBLIC_API_URL lines — using first https non-localhost for Vercel."
fi
echo ""

push_one() {
  local name="$1" value="$2" env_target="$3"
  if [ "$DRY_RUN" -eq 1 ]; then
    if [[ "$name" == *SECRET* ]]; then
      echo "[dry-run] $name ($env_target) = ***"
    else
      echo "[dry-run] $name ($env_target) = $value"
    fi
    return
  fi
  echo "==> $name ($env_target)"
  vercel env rm "$name" "$env_target" --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$name" "$env_target"
}

push_target() {
  local env_target="$1"
  push_one "NEXT_PUBLIC_API_URL" "$API_URL" "$env_target"
  push_one "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "$CLERK_PK" "$env_target"
  push_one "CLERK_SECRET_KEY" "$CLERK_SK" "$env_target"
}

if [ "$TARGET" = "all" ]; then
  for t in production preview development; do
    echo "--- $t ---"
    push_target "$t"
    echo ""
  done
else
  push_target "$TARGET"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run only — nothing pushed."
  exit 0
fi

echo ""
echo "Done. Env vars pushed to Vercel ($TARGET)."
echo "Redeploy: push to main (GitHub) or Vercel dashboard → Redeploy."
