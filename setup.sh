#!/bin/bash
#
# Setup symlinks for AI agents & skills in a target project.
#
# Usage:
#   ./setup.sh /path/to/your-project          # Link both .opencode and .agents
#   ./setup.sh /path/to/your-project opencode  # Link only .opencode
#   ./setup.sh /path/to/your-project agents    # Link only .agents
#
# What it does:
#   1. Creates symlinks from the target project to this repo
#   2. Adds the symlinked folders to the project's .gitignore
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [opencode|agents]}"
SCOPE="${2:-all}"  # "opencode", "agents", or "all"

# Resolve target to absolute path
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR"
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo ""
echo "🔗 agents-skills-custom — symlink setup"
echo "   Source: $SCRIPT_DIR"
echo "   Target: $TARGET_DIR"
echo "   Scope:  $SCOPE"
echo ""

link_folder() {
    local name="$1"
    local source="$SCRIPT_DIR/$name"
    local target="$TARGET_DIR/$name"

    if [ -L "$target" ]; then
        local current_source
        current_source="$(readlink "$target")"
        if [ "$current_source" = "$source" ]; then
            echo "   ℹ️  $name already linked correctly"
        else
            echo "   ⚠️  $name is a symlink to $current_source (different source)"
            echo "       Remove it manually if you want to relink: rm $target"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  $name exists and is NOT a symlink — skipping"
        echo "       If you want to replace it: rm -rf $target && rerun this script"
    else
        ln -s "$source" "$target"
        echo "   ✅ $name → linked"
    fi
}

# Create symlinks
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "opencode" ]; then
    link_folder ".opencode"
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "agents" ]; then
    link_folder ".agents"
fi

# Update .gitignore
add_to_gitignore() {
    local entry="$1"
    local gitignore="$TARGET_DIR/.gitignore"

    if [ ! -f "$gitignore" ]; then
        return  # No .gitignore, skip
    fi

    if ! grep -qxF "$entry" "$gitignore" 2>/dev/null; then
        echo "$entry" >> "$gitignore"
        echo "   ✅ Added '$entry' to .gitignore"
    fi
}

if [ -f "$TARGET_DIR/.gitignore" ]; then
    echo ""
    echo "📝 Updating .gitignore..."

    # Add header comment if neither entry exists yet
    if ! grep -q "\.opencode" "$TARGET_DIR/.gitignore" && ! grep -q "\.agents" "$TARGET_DIR/.gitignore"; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# AI Agent configs (symlinked from agents-skills-custom)" >> "$TARGET_DIR/.gitignore"
    fi

    if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "opencode" ]; then
        add_to_gitignore ".opencode"
    fi

    if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "agents" ]; then
        add_to_gitignore ".agents"
    fi
else
    echo ""
    echo "   ℹ️  No .gitignore found — skipping gitignore update"
fi

echo ""
echo "🎉 Done!"
echo ""
