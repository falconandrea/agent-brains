#!/usr/bin/env bash
# Global distribution of the canonical agent-brains skill catalog.
# The default is a read-only preview. No global installation is run by M2.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$SCRIPT_DIR/.agents/skills"
COMMAND_SRC="$SCRIPT_DIR/adapters/opencode/commands/spec-and-tasks.md"
HOME_DIR="${AGENT_BRAINS_HOME:-$HOME}"
MODE=preview

usage() {
    cat <<'USAGE'
Usage: ./install-global-skills.sh [--apply | --rollback | --doctor] [--home DIR]

Default: print a read-only preview. --apply links non-conflicting skills into
DIR/.agents/skills and the standalone OpenCode command into
DIR/.config/opencode/commands. --rollback removes only recorded links that
still point to this repository. --doctor checks catalog, profiles, duplicates,
links and adapter configuration. --home is intended for isolated fixtures.
The former upstream downloader is now ./update-upstream-skills.sh; use
--update-upstream here only as a compatibility route to that command.
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --apply) MODE=apply ;;
        --rollback) MODE=rollback ;;
        --doctor) MODE=doctor ;;
        --update-upstream) MODE=update-upstream ;;
        --home) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; HOME_DIR="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

fail() { echo "ERROR: $*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

[ -d "$HOME_DIR" ] || fail "home directory does not exist: $HOME_DIR"
HOME_DIR="$(cd "$HOME_DIR" && pwd -P)"

MANIFEST="$HOME_DIR/.agents/.agent-brains-global-manifest"
GLOBAL_SKILLS="$HOME_DIR/.agents/skills"
GLOBAL_COMMAND="$HOME_DIR/.config/opencode/commands/spec-and-tasks.md"
TMP_MANIFEST=""
TMP_TRACK=""

is_skill() { [ -d "$1" ] && [ -f "$1/SKILL.md" ]; }

read_manifest() {
    [ -f "$MANIFEST" ] || return 0
    [ ! -L "$MANIFEST" ] || fail "manifest is a symlink; refusing to read it: $MANIFEST"
    local rel src name expected
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] || continue
        case "$rel" in
            .agents/skills/*)
                name="${rel#.agents/skills/}"
                case "$name" in ''|.|..|*/*) fail "invalid manifest skill path: $rel" ;; esac
                expected="$SKILLS_DIR/$name"
                ;;
            .config/opencode/commands/spec-and-tasks.md) expected="$COMMAND_SRC" ;;
            *) fail "invalid manifest path: $rel" ;;
        esac
        [ "$src" = "$expected" ] || fail "manifest source does not match its managed path: $rel"
        printf '%s\t%s\n' "$rel" "$src"
    done < "$MANIFEST"
}

link_points_to() {
    local path="$1" expected="$2" actual
    [ -L "$path" ] || return 1
    actual="$(readlink "$path")"
    case "$actual" in /*) ;; *) actual="$(cd "$(dirname "$path")" && pwd -P)/$actual" ;; esac
    [ "$actual" = "$expected" ]
}

opencode_skill_conflict() {
    local source="$1" candidate
    candidate="$HOME_DIR/.config/opencode/skills/$(basename "$source")"
    if [ -e "$candidate" ] || [ -L "$candidate" ]; then
        link_points_to "$candidate" "$source" && return 1
        return 0
    fi
    return 1
}

check_no_symlink_parents() {
    local path="$1" cursor="" part old_ifs
    old_ifs="$IFS"; IFS=/; set -- $path; IFS="$old_ifs"
    for part in "$@"; do
        [ -n "$part" ] || continue
        cursor="$cursor/$part"
        [ ! -L "$cursor" ] || fail "refusing to write through symlinked directory: $cursor"
    done
}

preview() {
    local conflicts=0 count=0 src name dst
    say "Mode: preview (read-only)"
    say "Catalog: $SKILLS_DIR"
    say "Codex/OpenCode skills: $GLOBAL_SKILLS"
    say "OpenCode command: $GLOBAL_COMMAND"
    for src in "$SKILLS_DIR"/*; do
        [ -d "$src" ] || continue
        name="$(basename "$src")"; dst="$GLOBAL_SKILLS/$name"
        if ! is_skill "$src"; then say "INVALID: $name has no SKILL.md"; conflicts=$((conflicts + 1))
        elif opencode_skill_conflict "$src"; then say "CONFLICT (OpenCode duplicate; preserved): $name"; conflicts=$((conflicts + 1))
        elif link_points_to "$dst" "$src"; then say "ALREADY LINKED: $name"
        elif [ -e "$dst" ] || [ -L "$dst" ]; then say "CONFLICT (preserved): $name"; conflicts=$((conflicts + 1))
        else say "LINK: $name"; count=$((count + 1)); fi
    done
    if link_points_to "$GLOBAL_COMMAND" "$COMMAND_SRC"; then say "ALREADY LINKED: OpenCode /spec-and-tasks command"
    elif [ -e "$GLOBAL_COMMAND" ] || [ -L "$GLOBAL_COMMAND" ]; then say "CONFLICT (preserved): OpenCode /spec-and-tasks command"; conflicts=$((conflicts + 1))
    else say "LINK: OpenCode /spec-and-tasks command"; count=$((count + 1)); fi
    say "Summary: $count links to create; $conflicts conflicts/invalid entries"
    say "Use --apply to install."
}

cleanup_failed_install() {
    status=$?
    if [ "$status" -ne 0 ]; then
        if [ -n "$TMP_TRACK" ] && [ -f "$TMP_TRACK" ]; then
            while IFS= read -r item; do [ -n "$item" ] && rm -f "$item"; done < "$TMP_TRACK"
        fi
        [ -z "$TMP_MANIFEST" ] || rm -f "$TMP_MANIFEST"
        [ -z "$TMP_TRACK" ] || rm -f "$TMP_TRACK"
    fi
}

apply_install() {
    [ -d "$SKILLS_DIR" ] || fail "canonical skill catalog not found: $SKILLS_DIR"
    [ -f "$COMMAND_SRC" ] || fail "OpenCode adapter not found: $COMMAND_SRC"
    check_no_symlink_parents "$HOME_DIR/.agents/skills"
    check_no_symlink_parents "$HOME_DIR/.config/opencode/commands"
    local previous new_manifest tmp conflicts=0 src name dst rel
    previous="$(read_manifest)"; new_manifest="$previous"
    mkdir -p "$GLOBAL_SKILLS" "$(dirname "$GLOBAL_COMMAND")" "$(dirname "$MANIFEST")"
    tmp="$MANIFEST.tmp.$$"; TMP_MANIFEST="$tmp"; TMP_TRACK="$tmp.links"
    [ ! -e "$tmp" ] && [ ! -L "$tmp" ] || fail "temporary manifest path already exists: $tmp"
    : > "$TMP_TRACK"
    trap cleanup_failed_install EXIT
    for src in "$SKILLS_DIR"/*; do
        [ -d "$src" ] || continue
        name="$(basename "$src")"; dst="$GLOBAL_SKILLS/$name"; rel=".agents/skills/$name"
        if ! is_skill "$src"; then say "INVALID (skipped): $name"; conflicts=$((conflicts + 1))
        elif opencode_skill_conflict "$src"; then say "CONFLICT (OpenCode duplicate; preserved): $name"; conflicts=$((conflicts + 1))
        elif link_points_to "$dst" "$src"; then say "ALREADY LINKED: $name"
        elif [ -e "$dst" ] || [ -L "$dst" ]; then say "CONFLICT (preserved): $name"; conflicts=$((conflicts + 1))
        else
            ln -s "$src" "$dst"; printf '%s\n' "$dst" >> "$TMP_TRACK"
            say "LINKED: $name"
            new_manifest="$(printf '%s\n%s\t%s' "$new_manifest" "$rel" "$src" | sed '/^$/d')"
        fi
    done
    if link_points_to "$GLOBAL_COMMAND" "$COMMAND_SRC"; then say "ALREADY LINKED: OpenCode /spec-and-tasks command"
    elif [ -e "$GLOBAL_COMMAND" ] || [ -L "$GLOBAL_COMMAND" ]; then say "CONFLICT (preserved): OpenCode /spec-and-tasks command"; conflicts=$((conflicts + 1))
    else
        ln -s "$COMMAND_SRC" "$GLOBAL_COMMAND"; printf '%s\n' "$GLOBAL_COMMAND" >> "$TMP_TRACK"
        new_manifest="$(printf '%s\n%s\t%s' "$new_manifest" '.config/opencode/commands/spec-and-tasks.md' "$COMMAND_SRC" | sed '/^$/d')"
        say "LINKED: OpenCode /spec-and-tasks command"
    fi
    printf '%s\n' "$new_manifest" > "$tmp"
    mv "$tmp" "$MANIFEST"
    TMP_MANIFEST=""
    trap - EXIT
    if ! rm -f "$TMP_TRACK"; then
        say "WARNING: install committed; temporary rollback journal remains at $TMP_TRACK"
    fi
    TMP_TRACK=""
    say "Install complete; $conflicts conflict(s) preserved. Run --doctor for diagnostics."
}

rollback() {
    check_no_symlink_parents "$HOME_DIR/.agents/skills"
    check_no_symlink_parents "$HOME_DIR/.config/opencode/commands"
    [ -f "$MANIFEST" ] || { say "No installer manifest; nothing to roll back."; exit 0; }
    local rel src dst removed=0 preserved=0 manifest_contents
    manifest_contents="$(read_manifest)" || fail "invalid installer manifest; no rollback changes were made"
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] || continue
        dst="$HOME_DIR/$rel"
        if link_points_to "$dst" "$src"; then rm "$dst"; say "REMOVED: $rel"; removed=$((removed + 1))
        else say "PRESERVED (changed since install): $rel"; preserved=$((preserved + 1)); fi
    done <<EOF
$manifest_contents
EOF
    rm "$MANIFEST"
    rmdir "$(dirname "$MANIFEST")" 2>/dev/null || :
    rmdir "$(dirname "$GLOBAL_COMMAND")" 2>/dev/null || :
    rmdir "$(dirname "$GLOBAL_SKILLS")" 2>/dev/null || :
    rmdir "$HOME_DIR/.agents" 2>/dev/null || :
    rmdir "$HOME_DIR/.config/opencode" 2>/dev/null || :
    rmdir "$HOME_DIR/.config" 2>/dev/null || :
    say "Rollback complete: $removed removed; $preserved preserved."
}

doctor() {
    local issues=0 count=0 src name declared path target profile entry rel dependency manifest_contents
    say "agent-brains global distribution diagnostics"
    if [ ! -d "$SKILLS_DIR" ]; then say "FAIL: canonical catalog is missing"; issues=$((issues + 1))
    else
        for src in "$SKILLS_DIR"/*; do
            [ -d "$src" ] || continue
            name="$(basename "$src")"
            if [ ! -f "$src/SKILL.md" ]; then say "FAIL: $name has no SKILL.md"; issues=$((issues + 1)); continue; fi
            declared="$(sed -n '/^---$/,/^---$/s/^name:[[:space:]]*//p' "$src/SKILL.md" | sed -n '1p' | tr -d '\r"' | xargs)"
            if [ "$declared" != "$name" ]; then say "FAIL: $name declares '$declared'"; issues=$((issues + 1)); else count=$((count + 1)); fi
        done
        say "Catalog entries with valid SKILL.md/name: $count"
    fi
    if [ -d "$GLOBAL_SKILLS" ]; then
        for path in "$GLOBAL_SKILLS"/*; do
            [ -e "$path" ] || [ -L "$path" ] || continue
            name="$(basename "$path")"
            if [ -L "$path" ]; then
                target="$(readlink "$path")"; case "$target" in /*) ;; *) target="$(cd "$(dirname "$path")" && pwd -P)/$target" ;; esac
                if [ ! -e "$path" ]; then say "FAIL: broken global link: $name"; issues=$((issues + 1))
                elif [ -d "$SKILLS_DIR/$name" ] && [ "$target" != "$SKILLS_DIR/$name" ]; then say "DUPLICATE: global '$name' differs from catalog (preserved)"; issues=$((issues + 1)); fi
            elif [ -d "$SKILLS_DIR/$name" ]; then say "DUPLICATE: global '$name' exists as user content (preserved)"; issues=$((issues + 1)); fi
        done
    else say "INFO: global skill directory is not present"; fi
    if [ -d "$HOME_DIR/.config/opencode/skills" ]; then
        for path in "$HOME_DIR/.config/opencode/skills"/*; do
            [ -e "$path" ] || [ -L "$path" ] || continue
            name="$(basename "$path")"
            if [ -d "$SKILLS_DIR/$name" ] && [ "$(cd "$path" 2>/dev/null && pwd -P)" != "$(cd "$SKILLS_DIR/$name" 2>/dev/null && pwd -P)" ]; then
                say "DUPLICATE: OpenCode '$name' conflicts with the canonical catalog (preserved)"; issues=$((issues + 1))
            fi
        done
    fi
    if [ -e "$MANIFEST" ] || [ -L "$MANIFEST" ]; then
        if [ ! -f "$MANIFEST" ] || [ -L "$MANIFEST" ]; then
            say "FAIL: installer manifest is not a regular file (values omitted)"
            issues=$((issues + 1))
        elif manifest_contents="$(read_manifest)"; then
            while IFS="$(printf '\t')" read -r rel entry; do
                [ -n "${rel:-}" ] || continue
                path="$HOME_DIR/$rel"
                if ! link_points_to "$path" "$entry"; then say "FAIL: installer link missing or changed: $rel"; issues=$((issues + 1)); fi
            done <<EOF
$manifest_contents
EOF
        else
            say "FAIL: installer manifest is invalid; managed links could not be checked"
            issues=$((issues + 1))
        fi
    else say "INFO: no install manifest (installation not applied)"; fi
    if [ -e "$GLOBAL_COMMAND" ] || [ -L "$GLOBAL_COMMAND" ]; then
        if ! link_points_to "$GLOBAL_COMMAND" "$COMMAND_SRC"; then say "CONFLICT: OpenCode command path occupied (preserved)"; issues=$((issues + 1)); fi
    else say "INFO: OpenCode /spec-and-tasks command is not installed"; fi
    for profile in "$SCRIPT_DIR"/profiles/*.list; do
        [ -f "$profile" ] || continue
        while IFS= read -r entry; do
            case "$entry" in ''|\#*) continue ;; @include\ *) entry="${entry#@include }"; [ -f "$SCRIPT_DIR/profiles/$entry.list" ] || { say "FAIL: missing profile include '$entry'"; issues=$((issues + 1)); } ;; *) [ -d "$SKILLS_DIR/$entry" ] || { say "FAIL: profile skill '$entry' is absent"; issues=$((issues + 1)); } ;; esac
        done < "$profile"
    done
    while IFS= read -r dependency; do
        [ -n "$dependency" ] || continue
        if [ ! -d "$SKILLS_DIR/$dependency" ]; then
            say "EXTERNAL DEPENDENCY: Pi skill router references '$dependency', absent from the canonical catalog"
            issues=$((issues + 1))
        fi
    done <<EOF
$(sed -n '/const SKILL_CATEGORIES/,/^};/p' "$SCRIPT_DIR/src/skill-router.ts" | sed -n -E 's/^[[:space:]]*"([a-z0-9-]+)"[[:space:]]*:.*/\1/p; s/^[[:space:]]*([a-z][a-z0-9-]*)[[:space:]]*:.*/\1/p')
EOF
    if [ -f "$HOME_DIR/.config/opencode/opencode.json" ]; then
        say "INFO: OpenCode global config file is present (values not read)"
    else say "INFO: OpenCode global config file is absent"; fi
    if [ -f "$HOME_DIR/.codex/config.toml" ]; then
        say "INFO: Codex global config file is present (values not read)"
    else say "INFO: Codex global config file is absent"; fi
    if [ -f "$HOME_DIR/.pi/agent/settings.json" ]; then
        say "INFO: Pi global settings file is present (values not read)"
    else say "INFO: Pi global settings file is absent"; fi
    if [ "$issues" -eq 0 ]; then say "Result: no structural issues found."; else say "Result: $issues issue(s) found."; fi
    [ "$issues" -eq 0 ]
}

case "$MODE" in
    preview) preview ;;
    apply) apply_install ;;
    rollback) rollback ;;
    doctor) doctor ;;
    update-upstream) exec "$SCRIPT_DIR/update-upstream-skills.sh" ;;
esac
