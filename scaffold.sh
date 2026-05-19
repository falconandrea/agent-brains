#!/bin/bash
#
# Scaffold the .ai project context structure in a target project.
# Copies template files — does NOT create symlinks (these are project-specific).
#
# Usage:
#   ./scaffold.sh /path/to/your-project
#
# This will create:
#   .ai/context/    — PRD, APP_FLOW, TECH_STACK, ROADMAP, database_schema
#   .ai/features/   — Feature tracking with template
#   .ai/memory/     — lessons.md, progress.md
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates/.ai"
TARGET_DIR="${1:?❌ Usage: $0 /path/to/project}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR"
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
AI_DIR="$TARGET_DIR/.ai"

echo ""
echo "📁 agents-skills-custom — scaffold .ai context"
echo "   Template: $TEMPLATE_DIR"
echo "   Target:   $AI_DIR"
echo ""

if [ -d "$AI_DIR" ]; then
    echo "   ⚠️  .ai/ already exists in this project"
    read -p "   Overwrite missing files only? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Aborted."
        exit 0
    fi
fi

# Copy template files, without overwriting existing ones
copy_if_missing() {
    local src="$1"
    local dest="$2"

    mkdir -p "$(dirname "$dest")"

    if [ -f "$dest" ]; then
        echo "   ℹ️  $(basename "$dest") already exists — skipping"
    else
        cp "$src" "$dest"
        echo "   ✅ $(basename "$dest") created"
    fi
}

echo "   📄 AGENTS.md"
copy_if_missing "$SCRIPT_DIR/templates/AGENTS.md"             "$TARGET_DIR/AGENTS.md"

echo "   📂 context/"
copy_if_missing "$TEMPLATE_DIR/context/PRD.md"              "$AI_DIR/context/PRD.md"
copy_if_missing "$TEMPLATE_DIR/context/APP_FLOW.md"          "$AI_DIR/context/APP_FLOW.md"
copy_if_missing "$TEMPLATE_DIR/context/TECH_STACK.md"        "$AI_DIR/context/TECH_STACK.md"
copy_if_missing "$TEMPLATE_DIR/context/ROADMAP.md"           "$AI_DIR/context/ROADMAP.md"
copy_if_missing "$TEMPLATE_DIR/context/database_schema.mmd"  "$AI_DIR/context/database_schema.mmd"

echo "   📂 features/"
copy_if_missing "$TEMPLATE_DIR/features/_TEMPLATE.md"        "$AI_DIR/features/_TEMPLATE.md"

echo "   📂 memory/"
copy_if_missing "$TEMPLATE_DIR/memory/lessons.md"            "$AI_DIR/memory/lessons.md"
copy_if_missing "$TEMPLATE_DIR/memory/progress.md"           "$AI_DIR/memory/progress.md"

echo ""
echo "🎉 Done! Now fill in the templates with your project's details."
echo ""
