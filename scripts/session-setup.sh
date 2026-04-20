#!/usr/bin/env bash
# Claude Code SessionStart hook for Baburra.io.
#
# Goals: minimize wall-clock time and Claude token usage at session start.
#   1. Idempotent — re-running on a resumed session is cheap.
#   2. Deterministic installs (npm ci when lockfile is fresh).
#   3. Emits .claude/session-status.txt so Claude reads one file instead
#      of running ls / git / supabase commands for discovery.
#   4. Background cache warmers (types, repo map) — never block the session.
#   5. Never runs destructive or remote-mutating commands.

set -u
cd "$(dirname "$0")/.."

mkdir -p .claude
STATUS_FILE=".claude/session-status.txt"
MARKER_DIR=".claude/.setup-cache"
mkdir -p "$MARKER_DIR"

log()  { printf '[setup] %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── 1. Dependencies ─────────────────────────────────────────────────────────
LOCK_SHA=""
if [ -f package-lock.json ] && have sha1sum; then
  LOCK_SHA=$(sha1sum package-lock.json | awk '{print $1}')
fi
INSTALL_MARKER="$MARKER_DIR/install-$LOCK_SHA"

if [ ! -d node_modules ]; then
  log "node_modules missing — installing"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund --prefer-offline || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
  touch "$INSTALL_MARKER"
elif [ -n "$LOCK_SHA" ] && [ ! -f "$INSTALL_MARKER" ]; then
  log "lockfile changed — reinstalling"
  npm ci --no-audit --no-fund --prefer-offline || npm install --no-audit --no-fund
  rm -f "$MARKER_DIR"/install-* 2>/dev/null
  touch "$INSTALL_MARKER"
else
  log "deps up to date (skip install)"
fi

# ── 2. .env.local bootstrap ─────────────────────────────────────────────────
# Preserves the flow documented in CLAUDE.md — does not overwrite existing.
if [ ! -f .env.local ]; then
  if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
    log "materializing .env.local from environment"
    {
      for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
               SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN \
               SUPABASE_DB_PASSWORD GEMINI_API_KEY GEMINI_API_KEYS \
               TIINGO_API_TOKEN DEEPGRAM_API_KEY DEV_USER_ID; do
        val="${!v:-}"
        [ -n "$val" ] && printf '%s=%s\n' "$v" "$val"
      done
    } > .env.local
  fi
fi

# ── 3. Session status summary (one Read replaces many Bash calls) ───────────
{
  printf '# Baburra.io session status (generated %s)\n' "$(date -u +%FT%TZ)"

  printf '\n## Git\n'
  if have git; then
    printf 'branch: %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    printf 'head:   %s\n' "$(git log -1 --pretty='%h %s' 2>/dev/null || echo unknown)"
    dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    printf 'dirty:  %s file(s)\n' "$dirty"
  fi

  printf '\n## Env\n'
  if [ -f .env.local ]; then
    printf '.env.local: present (%s vars)\n' "$(grep -c '^[A-Z]' .env.local 2>/dev/null || echo 0)"
  else
    printf '.env.local: MISSING — Claude should prompt user or populate from env\n'
  fi

  printf '\n## OpenSpec — active changes\n'
  if [ -d openspec/changes ]; then
    active=$(find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive 2>/dev/null | sort)
    if [ -z "$active" ]; then
      printf '(none)\n'
    else
      printf '%s\n' "$active" | sed 's|openspec/changes/||'
    fi
  fi

  printf '\n## Supabase migrations (local)\n'
  if [ -d supabase/migrations ]; then
    latest=$(ls -1 supabase/migrations 2>/dev/null | tail -3)
    printf 'count: %s\n' "$(ls -1 supabase/migrations 2>/dev/null | wc -l | tr -d ' ')"
    printf 'latest:\n%s\n' "$latest"
  fi

  printf '\n## Node\n'
  printf 'node:    %s\n' "$(node -v 2>/dev/null || echo missing)"
  printf 'npm:     %s\n' "$(npm -v  2>/dev/null || echo missing)"
  printf 'next:    %s\n' "$(node -p "require('./package.json').dependencies.next" 2>/dev/null || echo unknown)"
} > "$STATUS_FILE"

# ── 4. Background cache warmers (non-blocking, best-effort) ─────────────────
REPO_MAP=".claude/repo-map.txt"
if [ ! -f "$REPO_MAP" ] || [ "$(find "$REPO_MAP" -mmin +1440 2>/dev/null)" ]; then
  (
    {
      printf '# Baburra.io repo map (depth 3, no node_modules/.next)\n'
      if have tree; then
        tree -L 3 -I 'node_modules|.next|.git|coverage|playwright-report' .
      else
        find . -maxdepth 3 \
          \( -path ./node_modules -o -path ./.next -o -path ./.git \
             -o -path ./coverage -o -path ./playwright-report \) -prune -o -print \
          | sort
      fi
    } > "$REPO_MAP" 2>/dev/null
  ) &
fi

log "ready → see $STATUS_FILE"
exit 0
