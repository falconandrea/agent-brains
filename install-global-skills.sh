#!/usr/bin/env bash
# install-global-skills.sh — bootstrap/install helper for a SELECTED subset of
# upstream-managed skills (the ones this script lists, all in skills-lock.json).
#
# This is NOT the complete skill inventory: many skills under .agents/skills/
# are hand-written or locally adopted (metadata.management: local in their
# SKILL.md) and must never be installed or refreshed through this script.
#
# Running this script installs skills directly into:
#   - .agents/skills/
#   - .opencode/skills/
#
# Because your projects are symlinked to this central repo, all linked
# projects will instantly gain access to these skills!

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1" >&2; }

info "Installing / updating selected upstream-managed skills in central repository..."

FAILED=()

install_skill() {
  local repo="$1"
  local skill_flags="$2"
  info "Installing from ${repo} ${skill_flags}..."
  # Run npx skills add targeting both antigravity and opencode.
  # A failed install is reported as failed — never masked with an OK.
  if npx --yes skills add "$repo" $skill_flags -a antigravity -a opencode; then
    log "OK: ${repo}"
  else
    fail "FAILED: ${repo}"
    FAILED+=("${repo}")
  fi
}

# 1. Base AI Skills
install_skill "obra/superpowers" \
  "--skill verification-before-completion"

install_skill "anthropics/skills" \
  "--skill webapp-testing --skill frontend-design"

# 2. Next.js / React Specialized Skills
install_skill "vercel-labs/agent-skills" \
  "--skill vercel-react-best-practices --skill web-design-guidelines --skill vercel-composition-patterns"

install_skill "vercel-labs/next-skills" \
  "--skill next-best-practices"

install_skill "millionco/react-doctor" \
  "--skill react-doctor"

install_skill "nextlevelbuilder/ui-ux-pro-max-skill" \
  "--skill ui-ux-pro-max"

install_skill "wshobson/agents" \
  "--skill tailwind-design-system"

install_skill "shadcn/ui" \
  "--skill shadcn"

install_skill "better-auth/skills" \
  "--skill better-auth-best-practices"

install_skill "supabase/agent-skills" \
  "--skill supabase-postgres-best-practices"

echo ""
if [ "${#FAILED[@]}" -gt 0 ]; then
  fail "Failed sources: ${FAILED[*]}"
  exit 1
fi
log "Selected skills successfully centralized!"
echo ""
