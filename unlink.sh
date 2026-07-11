#!/bin/bash
#
# Remove symlinks created by setup.sh from a target project.
#
# Usage:
#   ./unlink.sh /path/to/your-project          # Remove both
#   ./unlink.sh /path/to/your-project opencode # Remove only .opencode
#   ./unlink.sh /path/to/your-project agents   # Remove only .agents
#
# Handles both setup modes:
#   - full profile:  .agents is a single symlink → removed directly.
#   - profiled mode: .agents is a real dir with a curated skills/ of symlinks
#     → symlinks inside skills/ are removed; skills/ and .agents/ are removed
#     only if left empty (real user files are preserved).

set -euo pipefail

TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [opencode|agents]}"
SCOPE="${2:-all}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR"
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo ""
echo "🔗 agent-brains — unlink"
echo "   Target: $TARGET_DIR"
echo ""

unlink_opencode() {
    local target="$TARGET_DIR/.opencode"
    if [ -L "$target" ]; then
        rm "$target"
        echo "   ✅ .opencode symlink removed"
    elif [ -e "$target" ]; then
        echo "   ⚠️  .opencode exists but is NOT a symlink — not removing"
    else
        echo "   ℹ️  .opencode does not exist"
    fi
}

unlink_agents() {
    local target="$TARGET_DIR/.agents"

    # full profile mode: whole-dir symlink
    if [ -L "$target" ]; then
        rm "$target"
        echo "   ✅ .agents symlink removed (whole)"
        return
    fi

    # profiled mode: real dir with curated skills/
    if [ -d "$target" ]; then
        local skills="$target/skills"
        if [ -d "$skills" ]; then
            # Remove only symlinks we created; leave real files intact.
            find "$skills" -maxdepth 1 -type l -delete 2>/dev/null || true
            if rmdir "$skills" 2>/dev/null; then
                echo "   ✅ .agents/skills/ removed (was all symlinks)"
            else
                echo "   ℹ️  .agents/skills/ kept — contains real files (not ours to delete)"
            fi
        fi
        # workflows symlink, if present
        [ -L "$target/workflows" ] && rm "$target/workflows"
        # remove .agents/ only if now empty
        if rmdir "$target" 2>/dev/null; then
            echo "   ✅ .agents/ removed (was empty)"
        else
            echo "   ℹ️  .agents/ kept — has other content"
        fi
        return
    fi

    echo "   ℹ️  .agents does not exist"
}

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "opencode" ]; then
    unlink_opencode
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "agents" ]; then
    unlink_agents
fi

echo ""
echo "🎉 Done! (gitignore entries were left in place)"
echo ""
