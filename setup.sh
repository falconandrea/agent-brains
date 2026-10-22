#!/bin/bash
#
# Setup symlinks for AI agents & skills in a target project.
#
# Usage:
#   ./setup.sh /path/to/project               # default profile: full (all skills)
#   ./setup.sh /path/to/project laravel       # Laravel profile (curated skills)
#   ./setup.sh /path/to/project nextjs        # Next.js / React profile
#   ./setup.sh /path/to/project astro         # Astro profile
#   ./setup.sh /path/to/project nodejs        # Generic Node.js backend profile
#   ./setup.sh /path/to/project nodejs-ai-backend # Node.js/TypeScript AI backend profile
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
#
# OWNERSHIP MODEL (safety contract):
#   This script only removes or replaces symlinks whose resolved destination
#   is inside THIS repository (the canonical skill store, .agents/workflows,
#   .agents, .opencode). A symlink's name alone never proves ownership — the
#   destination is always verified, and relative destinations are resolved
#   against the link's own directory. Foreign symlinks and real files or
#   directories in the target project are always preserved; conflicts are
#   reported and the skill is skipped (never counted as installed).
#   The profile manifest is resolved and validated BEFORE anything is
#   modified, so an invalid profile cannot leave a partially cleared
#   installation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PROFILES_DIR="$SCRIPT_DIR/profiles"
REPO_AGENTS="$SCRIPT_DIR/.agents"
CANONICAL_SKILLS="$REPO_AGENTS/skills"
REPO_WORKFLOWS="$REPO_AGENTS/workflows"
REPO_OPENCODE="$SCRIPT_DIR/.opencode"

TARGET_DIR="${1:?❌ Usage: $0 /path/to/project [profile]}"
ARG2="${2:-full}"

fail() {
    echo "❌ $*" >&2
    exit 1
}

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory does not exist: $TARGET_DIR" >&2
    exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd -P)"

[ -d "$REPO_AGENTS" ] || fail "this repository's .agents dir not found: $REPO_AGENTS"
REPO_AGENTS="$(cd "$REPO_AGENTS" && pwd -P)"
[ -d "$CANONICAL_SKILLS" ] || fail "canonical skill store not found: $CANONICAL_SKILLS"
CANONICAL_SKILLS="$(cd "$CANONICAL_SKILLS" && pwd -P)"
if [ -d "$REPO_WORKFLOWS" ]; then
    REPO_WORKFLOWS="$(cd "$REPO_WORKFLOWS" && pwd -P)"
else
    REPO_WORKFLOWS=""
fi
[ -d "$REPO_OPENCODE" ] || fail "this repository's .opencode dir not found: $REPO_OPENCODE"
REPO_OPENCODE="$(cd "$REPO_OPENCODE" && pwd -P)"

# ----------------------------------------------------------------------------
# Symlink helpers (bash 3.2 compatible — keep in sync with unlink.sh)
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
# Manifest resolution and validation
# ----------------------------------------------------------------------------

# Allowed skill names: a single filesystem segment — no slashes (no nesting,
# no traversal) and no leading dot (no hidden or `.`/`..` entries).
valid_skill_name() {
    case "$1" in
        .*|*/*) return 1 ;;
        *) return 0 ;;
    esac
}

# Resolve a manifest recursively, honoring @include, printing one skill per
# line. Dedup preserves first occurrence. Portable (no associative arrays, so
# it works on macOS bash 3.2). Fails on a missing manifest, a missing
# @include, an @include cycle, or an invalid skill entry.
resolve_manifest() {
    local name="$1"
    local visited="${2:-}"
    local file="$PROFILES_DIR/$name.list"
    if [ ! -f "$file" ]; then
        echo "❌ manifest not found: $name.list" >&2
        return 1
    fi
    case " $visited " in
        *" $name "*)
            echo "❌ @include cycle detected at: $name.list" >&2
            return 1
            ;;
    esac
    visited="$visited $name"
    local line inc
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
                resolve_manifest "$inc" "$visited" || return 1
                ;;
            *)
                if ! valid_skill_name "$line"; then
                    echo "❌ invalid skill entry in $name.list: '$line'" >&2
                    return 1
                fi
                echo "$line"
                ;;
        esac
    done < "$file"
}

# ----------------------------------------------------------------------------
# Linking
# ----------------------------------------------------------------------------

link_opencode() {
    local target="$TARGET_DIR/.opencode"
    if [ -L "$target" ]; then
        if link_points_to "$target" "$REPO_OPENCODE"; then
            echo "   ℹ️  .opencode already linked correctly"
        else
            echo "   ⚠️  .opencode is a foreign symlink (→ $(resolve_link "$target")) — preserved"
            echo "       Remove it manually if you want to relink: rm $target"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  .opencode exists and is NOT a symlink — skipping"
        echo "       If you want to replace it: rm -rf $target && rerun this script"
    else
        ln -s "$REPO_OPENCODE" "$target"
        echo "   ✅ .opencode → linked"
    fi
}

# Link the whole .agents dir (used by the `full` profile — old behavior).
link_agents_whole() {
    local target="$TARGET_DIR/.agents"
    if [ -L "$target" ]; then
        if link_points_to "$target" "$REPO_AGENTS"; then
            echo "   ℹ️  .agents already linked correctly (whole)"
        else
            echo "   ⚠️  .agents is a foreign symlink (→ $(resolve_link "$target")) — preserved"
        fi
    elif [ -e "$target" ]; then
        echo "   ⚠️  .agents exists and is NOT a symlink — skipping whole-dir link"
        echo "       (agent-brains never replaces real content; remove it manually if you want the link)"
    else
        ln -s "$REPO_AGENTS" "$target"
        echo "   ✅ .agents → linked (whole, full profile)"
    fi
}

# A real .agents dir is convertible to the whole-dir `full` layout only when
# it contains EXCLUSIVELY content this repository owns: a skills/ directory
# of managed skill links (or a skills symlink to the canonical store) plus at
# most a managed workflows link. Anything else — real files/directories,
# foreign symlinks, hidden entries — blocks the conversion so the existing
# installation is preserved. Pure check: no mutation.
profiled_agents_convertible() {
    local agents_dir="$TARGET_DIR/.agents"
    local skills_dir="$agents_dir/skills"
    local entry

    if [ -L "$skills_dir" ]; then
        link_points_to "$skills_dir" "$CANONICAL_SKILLS" || return 1
    elif [ -d "$skills_dir" ]; then
        for entry in "$skills_dir"/* "$skills_dir"/.[!.]* "$skills_dir"/..?*; do
            [ -e "$entry" ] || [ -L "$entry" ] || continue
            if [ ! -L "$entry" ]; then return 1; fi
            if ! link_is_managed_skill "$entry"; then return 1; fi
        done
    elif [ -e "$skills_dir" ]; then
        # a real file (or anything else) at the skills path blocks conversion
        return 1
    fi

    for entry in "$agents_dir"/* "$agents_dir"/.[!.]* "$agents_dir"/..?*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        case "$(basename "$entry")" in
            skills)
                ;;
            workflows)
                [ -L "$entry" ] || return 1
                [ -n "$REPO_WORKFLOWS" ] || return 1
                link_points_to "$entry" "$REPO_WORKFLOWS" || return 1
                ;;
            *)
                return 1
                ;;
        esac
    done
    return 0
}

# True when a real .agents dir holds anything attributable to this
# repository — decides between a hard failure (blocked conversion of OUR
# installation) and a plain skip (directory that was never ours).
agents_dir_has_managed_content() {
    local agents_dir="$TARGET_DIR/.agents"
    local skills_dir="$agents_dir/skills"
    local entry

    if [ -L "$skills_dir" ]; then
        if link_points_to "$skills_dir" "$CANONICAL_SKILLS"; then return 0; fi
    elif [ -d "$skills_dir" ]; then
        for entry in "$skills_dir"/* "$skills_dir"/.[!.]* "$skills_dir"/..?*; do
            [ -L "$entry" ] || continue
            if link_is_managed_skill "$entry"; then return 0; fi
        done
    fi
    if [ -L "$agents_dir/workflows" ]; then
        if [ -n "$REPO_WORKFLOWS" ] && link_points_to "$agents_dir/workflows" "$REPO_WORKFLOWS"; then
            return 0
        fi
    fi
    return 1
}

# Remove the managed content of a CONVERTIBLE curated installation (the
# caller must have validated with profiled_agents_convertible first).
# Everything removed here resolves into this repository; directories are
# removed only when left empty (rmdir — real content is never deleted).
# The entry globs MUST match profiled_agents_convertible exactly (hidden
# entries included) so that nothing validated as removable is left behind.
clean_profiled_agents() {
    local agents_dir="$TARGET_DIR/.agents"
    local skills_dir="$agents_dir/skills"
    local entry

    if [ -L "$skills_dir" ]; then
        rm "$skills_dir"
    elif [ -d "$skills_dir" ]; then
        for entry in "$skills_dir"/* "$skills_dir"/.[!.]* "$skills_dir"/..?*; do
            [ -L "$entry" ] || continue
            if link_is_managed_skill "$entry"; then
                rm "$entry"
            fi
        done
        rmdir "$skills_dir" 2>/dev/null || :
    fi
    if [ -L "$agents_dir/workflows" ]; then
        if [ -n "$REPO_WORKFLOWS" ] && link_points_to "$agents_dir/workflows" "$REPO_WORKFLOWS"; then
            rm "$agents_dir/workflows"
        fi
    fi
    rmdir "$agents_dir" 2>/dev/null || :
    return 0
}

# Prepare the target for the `full` whole-dir link. Never traverses a
# symlinked .agents (removing links through it would modify the destination,
# including the canonical store itself on a repeated full setup). A blocked
# conversion fails BEFORE any link is removed, leaving the curated
# installation intact.
prepare_full_agents() {
    local agents_dir="$TARGET_DIR/.agents"

    # Symlinks are handled by link_agents_whole (managed → ok; foreign →
    # preserved with a warning). Nothing to clean through them.
    if [ -L "$agents_dir" ]; then
        return 0
    fi
    if [ ! -d "$agents_dir" ]; then
        return 0
    fi

    if profiled_agents_convertible; then
        clean_profiled_agents
        return 0
    fi

    if agents_dir_has_managed_content; then
        fail "cannot switch this project to the 'full' profile: $agents_dir holds content not owned by agent-brains.
   The curated installation was left intact. Remove the non-managed content manually, or keep a curated profile."
    fi

    echo "   ⚠️  .agents is a real directory with no agent-brains content — leaving it in place"
}

# Build a curated .agents/skills/ dir of per-skill symlinks (profiled mode).
# The manifest is already resolved and validated by the caller: this function
# only mutates links owned by this repository.
link_agents_profiled() {
    local profile="$1"
    local resolved="$2"
    local agents_dir="$TARGET_DIR/.agents"
    local skills_dir="$agents_dir/skills"

    # A skills dir that is itself a symlink to the canonical store is ours —
    # replace it with the curated real dir. (A foreign one was already
    # rejected during validation.)
    if [ -L "$skills_dir" ]; then
        rm "$skills_dir"
    fi
    mkdir -p "$skills_dir"

    # Refresh: remove only symlinks this repository owns (destination inside
    # the canonical store), hidden entries included. Foreign symlinks and
    # real files are preserved.
    local entry
    for entry in "$skills_dir"/* "$skills_dir"/.[!.]* "$skills_dir"/..?*; do
        [ -L "$entry" ] || continue
        if link_is_managed_skill "$entry"; then
            rm "$entry"
        else
            echo "   ℹ️  preserving foreign symlink: $(basename "$entry") → $(resolve_link "$entry")"
        fi
    done

    local count=0 skipped=0 skill src dst
    while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        src="$CANONICAL_SKILLS/$skill"
        dst="$skills_dir/$skill"
        if [ ! -e "$src" ] && [ ! -L "$src" ]; then
            echo "   ⚠️  skill not found in canonical store: $skill — skipping"
            skipped=$((skipped + 1))
            continue
        fi
        if [ -L "$dst" ]; then
            if link_points_to "$dst" "$src"; then
                count=$((count + 1))
            else
                echo "   ⚠️  '$skill' is a foreign symlink (→ $(resolve_link "$dst")) — preserved, not installed"
                echo "       Remove it manually if you want agent-brains to link this skill."
                skipped=$((skipped + 1))
            fi
        elif [ -e "$dst" ]; then
            echo "   ⚠️  '$skill' exists as a real file/directory — preserved, not installed"
            echo "       (agent-brains never replaces real content; remove it manually to link the skill)"
            skipped=$((skipped + 1))
        else
            ln -s "$src" "$dst"
            count=$((count + 1))
        fi
    done <<< "$resolved"

    if [ "$skipped" -gt 0 ]; then
        echo "   ✅ .agents/skills/ → $count skills linked, $skipped skipped (profile: $profile)"
    else
        echo "   ✅ .agents/skills/ → $count skills linked (profile: $profile)"
    fi

    # Also link workflows if the canonical store has it.
    if [ -n "$REPO_WORKFLOWS" ]; then
        if [ -L "$agents_dir/workflows" ]; then
            if link_points_to "$agents_dir/workflows" "$REPO_WORKFLOWS"; then
                echo "   ✅ .agents/workflows → linked"
            else
                echo "   ⚠️  .agents/workflows is a foreign symlink (→ $(resolve_link "$agents_dir/workflows")) — preserved"
            fi
        elif [ -e "$agents_dir/workflows" ]; then
            echo "   ⚠️  .agents/workflows exists and is NOT a symlink — skipping"
        else
            ln -s "$REPO_WORKFLOWS" "$agents_dir/workflows"
            echo "   ✅ .agents/workflows → linked"
        fi
    fi
}

add_to_gitignore() {
    local entry="$1"
    local gitignore="$TARGET_DIR/.gitignore"
    [ -f "$gitignore" ] || return 0
    if ! grep -qxF "$entry" "$gitignore" 2>/dev/null; then
        # Never concatenate onto a last line that has no final newline: that
        # would corrupt the existing entry and silently fail to ignore the
        # new one (e.g. ".agents" + ".pi/pi-brain.lock").
        if [ -s "$gitignore" ] && [ -n "$(tail -c 1 "$gitignore")" ]; then
            echo "" >> "$gitignore"
        fi
        echo "$entry" >> "$gitignore"
        echo "   ✅ Added '$entry' to .gitignore"
    fi
}

# ----------------------------------------------------------------------------
# Validation — everything that can fail must fail BEFORE any mutation
# ----------------------------------------------------------------------------

PROFILE="$ARG2"
RESOLVED_SKILLS=""

if [ "$PROFILE" = "opencode" ]; then
    :
elif [ "$PROFILE" = "full" ]; then
    :
elif [ -f "$PROFILES_DIR/$PROFILE.list" ]; then
    :
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

if [ "$PROFILE" != "full" ] && [ "$PROFILE" != "opencode" ]; then
    manifest_raw="$(resolve_manifest "$PROFILE")" || exit 1
    RESOLVED_SKILLS="$(printf '%s\n' "$manifest_raw" | awk '!seen[$0]++')"
    if [ -z "$RESOLVED_SKILLS" ]; then
        fail "profile '$PROFILE' resolved to no skills — check profiles/$PROFILE.list"
    fi

    # A foreign .agents (or .agents/skills) symlink must stop us before we
    # write anything: a curated profile needs a real directory there, and
    # writing through a foreign symlink would modify content we do not own.
    # A real FILE at either path is equally unusable and must fail with a
    # clear message instead of a cryptic mkdir error mid-installation.
    if [ -L "$TARGET_DIR/.agents" ]; then
        if ! link_points_to "$TARGET_DIR/.agents" "$REPO_AGENTS"; then
            fail "$TARGET_DIR/.agents is a foreign symlink (→ $(resolve_link "$TARGET_DIR/.agents")) — refusing to touch it.
   Remove it manually if you want a curated profile here."
        fi
    elif [ -e "$TARGET_DIR/.agents" ]; then
        if [ ! -d "$TARGET_DIR/.agents" ]; then
            fail "$TARGET_DIR/.agents exists but is a file, not a directory — refusing to touch it."
        fi
        if [ -L "$TARGET_DIR/.agents/skills" ]; then
            if ! link_points_to "$TARGET_DIR/.agents/skills" "$CANONICAL_SKILLS"; then
                fail "$TARGET_DIR/.agents/skills is a foreign symlink (→ $(resolve_link "$TARGET_DIR/.agents/skills")) — refusing to touch it.
   Remove it manually if you want a curated profile here."
            fi
        elif [ -e "$TARGET_DIR/.agents/skills" ] && [ ! -d "$TARGET_DIR/.agents/skills" ]; then
            fail "$TARGET_DIR/.agents/skills exists but is neither a directory nor a symlink — refusing to touch it."
        fi
    fi
fi

# ----------------------------------------------------------------------------
# Dispatch (mutation starts here)
# ----------------------------------------------------------------------------

echo ""
echo "🔗 agent-brains — setup"
echo "   Source:  $SCRIPT_DIR"
echo "   Target:  $TARGET_DIR"
if [ "$PROFILE" = "opencode" ]; then
    echo "   Scope:   opencode-only"
    echo ""
    link_opencode
    echo ""
    echo "   ⚠️  The OpenCode agent pointers in .opencode/agents/*.md read"
    echo "       .agents/workflows/*.md, which is NOT linked in this mode."
    echo "       To link .agents too, run: \"$SCRIPT_DIR/setup.sh\" \"$TARGET_DIR\" full"
    echo "       (or a curated profile such as laravel, nextjs, astro or nodejs)"
    echo ""
    echo "🎉 Done! (.agents not linked)"
    echo ""
    exit 0
fi

if [ "$PROFILE" = "full" ]; then
    echo "   Profile: full (all skills, whole-dir symlink)"
    echo ""
    link_opencode
    prepare_full_agents
    link_agents_whole
else
    echo "   Profile: $PROFILE (curated)"
    echo ""
    link_opencode
    if [ -L "$TARGET_DIR/.agents" ]; then
        echo "   ℹ️  Removing old .agents whole-dir symlink (owned by agent-brains)..."
        rm "$TARGET_DIR/.agents"
    fi
    link_agents_profiled "$PROFILE" "$RESOLVED_SKILLS"
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
    add_to_gitignore ".pi/pi-brain.lock"
    add_to_gitignore ".pi/pi-brain/"
else
    echo ""
    echo "   ℹ️  No .gitignore found — skipping gitignore update"
fi

echo ""
echo "🎉 Done!"
echo ""
