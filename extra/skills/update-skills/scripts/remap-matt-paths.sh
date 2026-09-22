#!/bin/bash
#
# Re-apply the .ai/ path remap to mattpocock-sourced skills.
# Run after `npx skills update`: the update overwrites local edits
# with upstream content, ignoring the lock's computedHash.
#
# Scoped: only skills whose source is mattpocock/skills in skills-lock.json.
# Idempotent: safe to run multiple times.
#
# Substitutions (see .agents/AGENTS.md "Matt Pocock skills: local path remap"):
#   docs/agents/issue-tracker.md -> .ai/agents/issue-tracker.md
#   docs/adr/                    -> .ai/adr/
#   CONTEXT.md                   -> .ai/context/GLOSSARY.md
#   CONTEXT-MAP.md               -> GLOSSARY-MAP.md
#   .scratch/                    -> .ai/features/
#
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
LOCK="$ROOT/skills-lock.json"
SKILLS_DIR="$ROOT/.agents/skills"

MATT_SKILLS=$(node -e '
const lock = require(process.argv[1]);
console.log(Object.entries(lock.skills)
  .filter(([, v]) => v.source === "mattpocock/skills")
  .map(([k]) => k).join("\n"));
' "$LOCK")

[ -n "$MATT_SKILLS" ] || { echo "no mattpocock skills found in lock"; exit 0; }

changed_files=0
for skill in $MATT_SKILLS; do
    dir="$SKILLS_DIR/$skill"
    [ -d "$dir" ] || { echo "⚠️  $skill in lock but not installed — skipping"; continue; }
    while IFS= read -r -d '' f; do
        tmp="$(mktemp)"
        cp "$f" "$tmp"
        perl -pi -e '
            s{docs/agents/issue-tracker\.md}{.ai/agents/issue-tracker.md}g;
            s{docs/adr/}{.ai/adr/}g;
            s{\bCONTEXT-MAP\.md}{GLOSSARY-MAP.md}g;
            s{\bCONTEXT\.md}{.ai/context/GLOSSARY.md}g;
            s{\.scratch/}{.ai/features/}g;
        ' "$f"
        if ! cmp -s "$tmp" "$f"; then
            echo "✅ remapped: ${f#"$ROOT"/}"
            changed_files=$((changed_files + 1))
        fi
        rm -f "$tmp"
    done < <(find "$dir" -name "*.md" -print0)
done

echo ""
echo "$changed_files file(s) remapped."

echo ""
echo "=== leftovers needing the agent pass (prose, trees, setup refs):"
leftovers=$(grep -rn "setup-matt-pocock-skills\|docs/agents\|docs/adr\|at the repo root" \
    $(for s in $MATT_SKILLS; do [ -d "$SKILLS_DIR/$s" ] && echo "$SKILLS_DIR/$s"; done) 2>/dev/null || true)
if [ -n "$leftovers" ]; then
    echo "$leftovers"
else
    echo "(none)"
fi
