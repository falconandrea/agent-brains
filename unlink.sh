#!/bin/bash
#
# Remove the symlinks agent-brains owns from a target project.
#
# Usage:
#   ./unlink.sh /path/to/your-project          # Remove both
#   ./unlink.sh /path/to/your-project opencode # Remove only .opencode
#   ./unlink.sh /path/to/your-project agents   # Remove only .agents
#
# OWNERSHIP MODEL (safety contract — mirrors setup.sh):
#   Only symlinks whose resolved destination is inside THIS repository (the
#   canonical skill store, .agents/workflows, .agents, .opencode) are
#   removed. A symlink's name alone never proves ownership — the destination
#   is always verified, and relative destinations are resolved against the
#   link's own directory. Foreign symlinks, real files and directories are
#   preserved and reported. Directories are removed only when left empty
#   (rmdir), so real user content is never deleted.
#
#   Limitation: if this repository was moved or renamed after setup, its
#   links no longer resolve to paths under the current copy and unlink.sh
#   will (conservatively) preserve them, telling you where they point.
#
# Handles both setup modes:
#   - full profile:  .agents is a single symlink → removed directly.
#   - profiled mode: .agents is a real dir with a curated skills/ of symlinks
#     → owned symlinks inside skills/ are removed; skills/ and .agents/ are
#     removed only if left empty (real user files are preserved).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_AGENTS="$SCRIPT_DIR/.agents"
CANONICAL_SKILLS="$REPO_AGENTS/skills"
REPO_WORKFLOWS="$REPO_AGENTS/workflows"
REPO_OPENCODE="$SCRIPT_DIR/.opencode"

fail() {
    echo "❌ $*" >&2
    exit 1
}

[ -d "$REPO_AGENTS" ] || fail "cannot locate this repository's .agents dir: $REPO_AGENTS"
REPO_AGENTS="$(cd "$REPO_AGENTS" && pwd -P)"
[ -d "$CANONICAL_SKILLS" ] || fail "canonical skill store not found: $CANONICAL_SKILLS"
CANONICAL_SKILLS="$(cd "$CANONICAL_SKILLS" && pwd -P)"
if [ -d "$REPO_WORKFLOWS" ]; then
    REPO_WORKFLOWS="$(cd "$REPO_WORKFLOWS" && pwd -P)"
else
    REPO_WORKFLOWS=""
fi

TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [opencode|agents]}"
SCOPE="${2:-all}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR" >&2
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd -P)"

# ----------------------------------------------------------------------------
# Symlink helpers (bash 3.2 compatible — keep in sync with setup.sh)
# ----------------------------------------------------------------------------

# Print the raw destination of symlink $1 with relative targets resolved
# against the link's own directory (absolute, but not yet normalized).
# Returns non-zero if $1 is not a readable symlink.
link_destination() {
    local link="$1" raw
    raw="$(readlink "$link")" || return 1
    if [ "${raw#/}" != "$raw" ]; then
        printf '%s\n' "$raw"
    else
        local parent
        parent="$(cd "$(dirname "$link")" && pwd -P)"
        printf '%s\n' "$parent/$raw"
    fi
}

# Normalize an absolute path to physical-parent + basename. When the parent
# exists on disk it is resolved through the filesystem (pwd -P), which also
# cleans any `.`/`..` components; otherwise the input is returned unchanged.
physical_destination() {
    local abs="$1" parent base resolved_parent
    parent="$(dirname "$abs")"
    base="$(basename "$abs")"
    if resolved_parent="$(cd "$parent" 2>/dev/null && pwd -P)"; then
        printf '%s\n' "$resolved_parent/$base"
    else
        printf '%s\n' "$abs"
    fi
}

# Print the resolved destination of symlink $1 (relative targets resolved,
# physical where the filesystem allows). Returns non-zero if not a symlink.
resolve_link() {
    local dest
    dest="$(link_destination "$1")" || return 1
    physical_destination "$dest"
}

# True when symlink $1 resolves exactly to the absolute path $2.
link_points_to() {
    local dest
    dest="$(resolve_link "$1")" || return 1
    [ "$dest" = "$2" ]
}

# True when symlink $1 resolves inside the canonical skill store — i.e. the
# link is attributable to this repository, whatever its name.
link_is_managed_skill() {
    local dest
    dest="$(resolve_link "$1")" || return 1
    case "$dest" in
        "$CANONICAL_SKILLS"/*) return 0 ;;
    esac
    return 1
}

# ----------------------------------------------------------------------------
# Unlink
# ----------------------------------------------------------------------------

unlink_opencode() {
    local target="$TARGET_DIR/.opencode"
    if [ -L "$target" ]; then
        if link_points_to "$target" "$REPO_OPENCODE"; then
            rm "$target"
            echo "   ✅ .opencode symlink removed"
        else
            echo "   ⚠️  .opencode is a foreign symlink (→ $(resolve_link "$target")) — preserved"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  .opencode exists but is NOT a symlink — not removing"
    else
        echo "   ℹ️  .opencode does not exist"
    fi
}

unlink_agents() {
    local target="$TARGET_DIR/.agents"

    # full profile mode: whole-dir symlink — remove only if it is ours.
    if [ -L "$target" ]; then
        if link_points_to "$target" "$REPO_AGENTS"; then
            rm "$target"
            echo "   ✅ .agents symlink removed (whole)"
        else
            echo "   ⚠️  .agents is a foreign symlink (→ $(resolve_link "$target")) — preserved"
        fi
        return 0
    fi

    # profiled mode: real dir with curated skills/
    if [ -d "$target" ]; then
        local skills="$target/skills" entry
        if [ -L "$skills" ]; then
            if link_points_to "$skills" "$CANONICAL_SKILLS"; then
                rm "$skills"
                echo "   ✅ .agents/skills symlink removed (whole-store)"
            else
                echo "   ⚠️  .agents/skills is a foreign symlink (→ $(resolve_link "$skills")) — preserved"
            fi
        elif [ -d "$skills" ]; then
            # Remove only symlinks this repository owns (hidden entries
            # included); leave the rest.
            for entry in "$skills"/* "$skills"/.[!.]* "$skills"/..?*; do
                [ -L "$entry" ] || continue
                if link_is_managed_skill "$entry"; then
                    rm "$entry"
                else
                    echo "   ℹ️  preserving foreign skill symlink: $(basename "$entry") → $(resolve_link "$entry")"
                fi
            done
            if rmdir "$skills" 2>/dev/null; then
                echo "   ✅ .agents/skills/ removed (was all agent-brains symlinks)"
            else
                echo "   ℹ️  .agents/skills/ kept — contains files or symlinks not owned by agent-brains"
            fi
        fi
        # workflows symlink — remove only if it is ours.
        if [ -L "$target/workflows" ]; then
            if [ -n "$REPO_WORKFLOWS" ] && link_points_to "$target/workflows" "$REPO_WORKFLOWS"; then
                rm "$target/workflows"
                echo "   ✅ .agents/workflows symlink removed"
            else
                echo "   ⚠️  .agents/workflows is a foreign symlink (→ $(resolve_link "$target/workflows")) — preserved"
            fi
        fi
        # remove .agents/ only if now empty
        if rmdir "$target" 2>/dev/null; then
            echo "   ✅ .agents/ removed (was empty)"
        else
            echo "   ℹ️  .agents/ kept — has other content"
        fi
        return 0
    fi

    echo "   ℹ️  .agents does not exist"
}

echo ""
echo "🔗 agent-brains — unlink"
echo "   Target: $TARGET_DIR"
echo ""

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "opencode" ]; then
    unlink_opencode
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "agents" ]; then
    unlink_agents
fi

echo ""
echo "🎉 Done! (gitignore entries were left in place)"
echo ""
