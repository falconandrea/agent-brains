#!/bin/bash
#
# Remove symlinks created by setup.sh from a target project.
#
# Usage:
#   ./unlink.sh /path/to/your-project          # Remove both
#   ./unlink.sh /path/to/your-project opencode  # Remove only .opencode
#   ./unlink.sh /path/to/your-project agents    # Remove only .agents
#

set -euo pipefail

TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [opencode|agents]}"
SCOPE="${2:-all}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR"
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo ""
echo "🔗 agents-skills-custom — unlink"
echo "   Target: $TARGET_DIR"
echo ""

unlink_folder() {
    local name="$1"
    local target="$TARGET_DIR/$name"

    if [ -L "$target" ]; then
        rm "$target"
        echo "   ✅ $name symlink removed"
    elif [ -e "$target" ]; then
        echo "   ⚠️  $name exists but is NOT a symlink — not removing"
    else
        echo "   ℹ️  $name does not exist"
    fi
}

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "opencode" ]; then
    unlink_folder ".opencode"
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "agents" ]; then
    unlink_folder ".agents"
fi

echo ""
echo "🎉 Done! (gitignore entries were left in place)"
echo ""
