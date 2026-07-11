#!/bin/bash
#
# Setup symlinks for AI agents & skills in a target project.
#
# Usage:
#   ./setup.sh /path/to/project               # default profile: full (all skills)
#   ./setup.sh /path/to/project laravel       # Laravel profile (curated skills)
#   ./setup.sh /path/to/project nextjs        # Next.js / React profile
#   ./setup.sh /path/to/project astro         # Astro profile
#   ./setup.sh /path/to/project nodejs        # Node.js backend profile
#   ./setup.sh /path/to/project full          # all skills (escape hatch)
#   ./setup.sh /path/to/project opencode      # link .opencode only (no .agents)
#
# Profiles are defined in profiles/<name>.list — one skill per line.
# A list can pull in another with `@include <name>` (e.g. laravel includes frontend).
# The canonical skill store is .agents/skills/ (where laravel-boost / npx skills write).
# Projects only consume a curated subset via per-skill symlinks.
#
# `full` is special-cased: it symlinks the whole .agents/skills dir so newly
# installed skills appear automatically without editing any manifest.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CANONICAL_SKILLS="$SCRIPT_DIR/.agents/skills"
PROFILES_DIR="$SCRIPT_DIR/profiles"

TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [profile]}"
ARG2="${2:-full}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR"
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

# Resolve a manifest recursively, honoring @include, printing one skill per
# line. Dedup preserves first occurrence. Portable (no associative arrays, so
# it works on macOS bash 3.2). Output is piped through awk for dedup.
resolve_manifest() {
    local name="$1"
    local file="$PROFILES_DIR/$name.list"
    if [ ! -f "$file" ]; then
        echo "❌ manifest not found: $name.list" >&2
        exit 1
    fi
    while IFS= read -r line || [ -n "$line" ]; do
        # strip comments
        line="${line%%#*}"
        # trim whitespace
        line="$(echo "$line" | xargs)"
        [ -z "$line" ] && continue
        case "$line" in
            @include\ *)
                inc="${line#@include }"
                inc="$(echo "$inc" | xargs)"
                resolve_manifest "$inc"
                ;;
            *)
                echo "$line"
                ;;
        esac
    done < "$file"
}

link_opencode() {
    local source="$SCRIPT_DIR/.opencode"
    local target="$TARGET_DIR/.opencode"
    if [ -L "$target" ]; then
        local current_source
        current_source="$(readlink "$target")"
        if [ "$current_source" = "$source" ]; then
            echo "   ℹ️  .opencode already linked correctly"
        else
            echo "   ⚠️  .opencode is a symlink to $current_source (different source)"
            echo "       Remove it manually if you want to relink: rm $target"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  .opencode exists and is NOT a symlink — skipping"
        echo "       If you want to replace it: rm -rf $target && rerun this script"
    else
        ln -s "$source" "$target"
        echo "   ✅ .opencode → linked"
    fi
}

# Link the whole .agents dir (used by the `full` profile — old behavior).
link_agents_whole() {
    local source="$SCRIPT_DIR/.agents"
    local target="$TARGET_DIR/.agents"
    if [ -L "$target" ]; then
        local current_source
        current_source="$(readlink "$target")"
        if [ "$current_source" = "$source" ]; then
            echo "   ℹ️  .agents already linked correctly (whole)"
        else
            echo "   ⚠️  .agents is a symlink to $current_source (different source)"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  .agents exists and is NOT a symlink — skipping"
        echo "       If you want to replace it: rm -rf $target && rerun this script"
    else
        ln -s "$source" "$target"
        echo "   ✅ .agents → linked (whole, full profile)"
    fi
}

# Build a curated .agents/skills/ dir of per-skill symlinks (profiled mode).
link_agents_profiled() {
    local profile="$1"
    local agents_dir="$TARGET_DIR/.agents"
    local skills_dir="$agents_dir/skills"

    mkdir -p "$skills_dir"

    # Refresh: remove symlinks we may have created before (leave real files).
    find "$skills_dir" -maxdepth 1 -type l -delete 2>/dev/null || true

    local count=0
    # resolve + dedup (awk preserves first occurrence order)
    local resolved
    resolved="$(resolve_manifest "$profile" | awk '!seen[$0]++')"

    if [ -z "$resolved" ]; then
        echo "   ⚠️  profile '$profile' resolved to no skills — check profiles/$profile.list"
    fi

    while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        local src="$CANONICAL_SKILLS/$skill"
        local dst="$skills_dir/$skill"
        if [ ! -e "$src" ] && [ ! -L "$src" ]; then
            echo "   ⚠️  skill not found in canonical store: $skill — skipping"
            continue
        fi
        ln -sfn "$src" "$dst"
        count=$((count + 1))
    done <<< "$resolved"

    echo "   ✅ .agents/skills/ → $count skills linked (profile: $profile)"

    # Also link workflows if the canonical store has it.
    if [ -d "$SCRIPT_DIR/.agents/workflows" ]; then
        ln -sfn "$SCRIPT_DIR/.agents/workflows" "$agents_dir/workflows"
        echo "   ✅ .agents/workflows → linked"
    fi
}

add_to_gitignore() {
    local entry="$1"
    local gitignore="$TARGET_DIR/.gitignore"
    [ -f "$gitignore" ] || return 0
    if ! grep -qxF "$entry" "$gitignore" 2>/dev/null; then
        echo "$entry" >> "$gitignore"
        echo "   ✅ Added '$entry' to .gitignore"
    fi
}

# ----------------------------------------------------------------------------
# Dispatch
# ----------------------------------------------------------------------------

echo ""
echo "🔗 agent-brains — setup"
echo "   Source:  $SCRIPT_DIR"
echo "   Target:  $TARGET_DIR"
echo ""

# opencode-only scope (backward compat keyword).
if [ "$ARG2" = "opencode" ]; then
    echo "   Scope:   opencode-only"
    echo ""
    link_opencode
    echo ""
    echo "🎉 Done! (.agents not linked)"
    echo ""
    exit 0
fi

PROFILE="$ARG2"

if [ "$PROFILE" = "full" ]; then
    echo "   Profile: full (all skills, whole-dir symlink)"
    echo ""
    link_opencode
    link_agents_whole
elif [ -f "$PROFILES_DIR/$PROFILE.list" ]; then
    echo "   Profile: $PROFILE (curated)"
    echo ""
    link_opencode
    link_agents_profiled "$PROFILE"
else
    echo "❌ Unknown profile: $PROFILE"
    echo ""
    echo "   Available profiles:"
    for f in "$PROFILES_DIR"/*.list; do
        [ -f "$f" ] || continue
        printf "     - %s\n" "$(basename "$f" .list)"
    done
    echo "     - full (all skills)"
    echo ""
    echo "   Special: 'opencode' links .opencode only."
    exit 1
fi

# Update .gitignore
if [ -f "$TARGET_DIR/.gitignore" ]; then
    echo ""
    echo "📝 Updating .gitignore..."
    if ! grep -q "\.opencode" "$TARGET_DIR/.gitignore" && ! grep -q "\.agents" "$TARGET_DIR/.gitignore"; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# AI Agent configs (symlinked from agent-brains)" >> "$TARGET_DIR/.gitignore"
    fi
    add_to_gitignore ".opencode"
    add_to_gitignore ".agents"
else
    echo ""
    echo "   ℹ️  No .gitignore found — skipping gitignore update"
fi

echo ""
echo "🎉 Done!"
echo ""
