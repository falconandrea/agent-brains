#!/usr/bin/env bash
# Global distribution of the canonical agent-brains skill catalog.
# The default is a read-only preview.
#
# Resources managed here: per-skill links in DIR/.agents/skills, the standalone
# OpenCode planning command, seven OpenCode workflow agent adapters, and — only
# when not already registered — the Pi package registration for this checkout,
# performed through Pi's own package manager. Conflicts, missing harness
# executables and unfinished Pi steps produce an explicit INCOMPLETE result,
# never an overwrite. Automated repair of relocated checkouts and stale
# resources is deferred; diagnostics explain the manual recovery instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$SCRIPT_DIR/.agents/skills"
COMMAND_SRC="$SCRIPT_DIR/adapters/opencode/commands/spec-and-tasks.md"
AGENTS_SRC_DIR="$SCRIPT_DIR/adapters/opencode/agents"
HOME_DIR="${AGENT_BRAINS_HOME:-$HOME}"
MODE=preview

usage() {
    cat <<'USAGE'
Usage: ./install-global-skills.sh [--apply | --rollback | --doctor] [--home DIR]

Default: print a read-only preview. --apply links non-conflicting skills into
DIR/.agents/skills, the standalone OpenCode command into
DIR/.config/opencode/commands, the seven OpenCode agent adapters into
DIR/.config/opencode/agents, and registers this checkout as a global Pi
package through `pi install` when no such registration exists. Anything
unresolved (conflicts, missing `pi` executable, failed registration) is
reported as RESULT: INCOMPLETE with a safe rerun path; nothing is overwritten.
--rollback removes only recorded links that still point to this repository and
removes only a registration this installer recorded; pre-existing
registrations and unrelated settings survive. --doctor checks catalog,
profiles, duplicates, links, agents, Pi registration and relocation state.
--home is intended for isolated fixtures; PI_CODING_AGENT_DIR is honored as
the Pi agent-dir override and reported. The former upstream downloader is now
./update-upstream-skills.sh; use --update-upstream here only as a
compatibility route to that command.
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

# Canonical absolute form of a path, resolving through the deepest existing
# ancestor so recorded destinations still compare after partial cleanup.
abs_path() {
    local d b
    d="$(dirname "$1")"; b="$(basename "$1")"
    while [ ! -d "$d" ] && [ "$d" != "/" ]; do
        b="$(basename "$d")/$b"; d="$(dirname "$d")"
    done
    if [ -d "$d" ]; then
        printf '%s/%s\n' "$(cd "$d" && pwd -P)" "$b"
    else
        printf '%s\n' "$1"
    fi
}

[ -d "$HOME_DIR" ] || fail "home directory does not exist: $HOME_DIR"
HOME_DIR="$(cd "$HOME_DIR" && pwd -P)"

MANIFEST="$HOME_DIR/.agents/.agent-brains-global-manifest"
GLOBAL_SKILLS="$HOME_DIR/.agents/skills"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME_DIR/.pi/agent}"
PI_SETTINGS="$PI_AGENT_DIR/settings.json"
PI_KEY="pi-package"
TMP_MANIFEST=""
TMP_TRACK=""

# Relative-to-home form of a managed destination when it lives under --home;
# otherwise the absolute path itself (recorded and resolved as-is).
rel_under_home() {
    case "$1" in
        "$HOME_DIR"/*) printf '%s\n' "${1#"$HOME_DIR"/}" ;;
        *) printf '%s\n' "$1" ;;
    esac
}
dst_of_rel() {
    case "$1" in
        /*) printf '%s\n' "$1" ;;
        *) printf '%s\n' "$HOME_DIR/$1" ;;
    esac
}

# OpenCode reads its global config root from XDG_CONFIG_HOME when set
# (verified via `opencode debug paths` on 2.2.5): never install into a
# location the harness would not read. The root is canonicalized through its
# deepest existing ancestor so symlinked prefixes (macOS /var) are resolved
# before any parent-symlink safety check runs.
OPENCODE_CONFIG_ROOT="$(abs_path "${XDG_CONFIG_HOME:-$HOME_DIR/.config}")/opencode"
GLOBAL_COMMAND="$OPENCODE_CONFIG_ROOT/commands/spec-and-tasks.md"
GLOBAL_AGENTS="$OPENCODE_CONFIG_ROOT/agents"
COMMAND_REL="$(rel_under_home "$GLOBAL_COMMAND")"
AGENTS_DIR_REL="$(rel_under_home "$GLOBAL_AGENTS")"

is_skill() { [ -d "$1" ] && [ -f "$1/SKILL.md" ]; }

# A valid agent adapter is a Markdown file with YAML frontmatter that declares
# a primary mode; deeper content rules live in tests/repo.test.ts.
is_agent() {
    [ -f "$1" ] || return 1
    head -n 1 "$1" | grep -q '^---[[:space:]]*$' || return 1
    grep -q '^mode:[[:space:]]*primary[[:space:]]*$' "$1" || return 1
}

report_roots() {
    say "Catalog: $SKILLS_DIR"
    say "Codex/OpenCode skills: $GLOBAL_SKILLS"
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        say "OpenCode config root: $OPENCODE_CONFIG_ROOT (XDG_CONFIG_HOME override in effect)"
    else
        say "OpenCode config root: $OPENCODE_CONFIG_ROOT"
    fi
    say "OpenCode command: $GLOBAL_COMMAND"
    say "OpenCode agents: $GLOBAL_AGENTS"
    if [ -n "${PI_CODING_AGENT_DIR:-}" ]; then
        say "Pi agent dir: $PI_AGENT_DIR (PI_CODING_AGENT_DIR override in effect)"
    else
        say "Pi agent dir: $PI_AGENT_DIR"
    fi
}

# Whether `pi` sees this checkout as a registered user package. Returns 2 when
# the pi executable is unavailable; the caller decides the INCOMPLETE path.
pi_registered() {
    command -v pi >/dev/null 2>&1 || return 2
    PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi list 2>/dev/null \
        | sed 's/^[[:space:]]*//' | grep -qFx "$SCRIPT_DIR"
}

pi_remove_registration() {
    PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi remove "$SCRIPT_DIR"
}

# Report (best effort, bounded) manifest entries whose recorded source no
# longer matches this checkout. Prints up to three evidence pairs plus counts.
# Returns 0 when at least one relocation mismatch was seen.
manifest_relocation_evidence() {
    local rel src expected moved=0 shown=0 suffix
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] || continue
        case "$rel" in
            .agents/skills/*) expected="$SKILLS_DIR/${rel#.agents/skills/}" ;;
            .config/opencode/commands/spec-and-tasks.md|"$COMMAND_REL") expected="$COMMAND_SRC" ;;
            .config/opencode/agents/*|"$AGENTS_DIR_REL"/*)
                case "$rel" in
                    "$AGENTS_DIR_REL"/*) name="${rel#"$AGENTS_DIR_REL"/}" ;;
                    *) name="${rel#.config/opencode/agents/}" ;;
                esac
                expected="$AGENTS_SRC_DIR/$name"
                ;;
            .pi/agent/settings.json|/*) expected="$PI_KEY:$SCRIPT_DIR" ;;
            *) expected="" ;;
        esac
        [ -n "$expected" ] || continue
        [ "$src" = "$expected" ] && continue
        moved=$((moved + 1))
        if [ "$shown" -lt 3 ]; then
            say "RELOCATION EVIDENCE: $rel"
            say "  recorded source: $src"
            say "  current source:  $expected"
            shown=$((shown + 1))
        fi
    done < "$MANIFEST"
    [ "$moved" -gt 0 ] && { say "Relocated entries: $moved"; return 0; }
    return 1
}

relocation_error() {
    say "ERROR: CHECKOUT RELOCATED — the manifest records sources from another checkout." >&2
    manifest_relocation_evidence >&2 || :
    cat >&2 <<RECOVERY
No mutation was performed. Complete manual recovery (automated rebind is
deferred); follow every step, then verify:
  1. Verify the recorded sources above are the same resources as this checkout.
  2. Remove every global link below that still points into the OLD checkout
     (they are not owned by this checkout and are never pruned automatically).
  3. Archive the stale manifest so a fresh apply can start:
       mv "$MANIFEST" "$MANIFEST.relocated.$(date +%Y%m%d-%H%M%S)"
     (keeping the archive preserves the old evidence; deleting the manifest
     without step 2 would orphan the old links).
  4. From this NEW checkout run: ./install-global-skills.sh --apply
     It must end with RESULT: COMPLETE; then confirm with --doctor.

Managed paths recorded in the old manifest (step 2):
RECOVERY
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] && say "  $(dst_of_rel "$rel")"
    done < "$MANIFEST" >&2
    exit 1
}

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
            .config/opencode/commands/spec-and-tasks.md|"$COMMAND_REL") expected="$COMMAND_SRC" ;;
            .config/opencode/agents/*|"$AGENTS_DIR_REL"/*)
                case "$rel" in
                    "$AGENTS_DIR_REL"/*) name="${rel#"$AGENTS_DIR_REL"/}" ;;
                    *) name="${rel#.config/opencode/agents/}" ;;
                esac
                case "$name" in ''|.|..|*/*|.md|*.md/) fail "invalid manifest agent path: $rel" ;;
                *.md) expected="$AGENTS_SRC_DIR/$name" ;;
                *) fail "invalid manifest agent path: $rel" ;;
            esac
            ;;
            .pi/agent/settings.json) expected="$PI_KEY:$SCRIPT_DIR" ;;
            /*)
                [ "$(abs_path "$rel")" = "$PI_SETTINGS" ] || fail "invalid manifest path: $rel"
                expected="$PI_KEY:$SCRIPT_DIR"
                ;;
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
    candidate="$OPENCODE_CONFIG_ROOT/skills/$(basename "$source")"
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
    report_roots
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
    for src in "$AGENTS_SRC_DIR"/*.md; do
        [ -e "$src" ] || continue
        name="$(basename "$src")"; dst="$GLOBAL_AGENTS/$name"
        if ! is_agent "$src"; then say "INVALID: agent adapter $name has no primary frontmatter"; conflicts=$((conflicts + 1))
        elif link_points_to "$dst" "$src"; then say "ALREADY LINKED: OpenCode agent $name"
        elif [ -e "$dst" ] || [ -L "$dst" ]; then say "CONFLICT (preserved): OpenCode agent $name"; conflicts=$((conflicts + 1))
        else say "LINK: OpenCode agent $name"; count=$((count + 1)); fi
    done
    case "$(pi_registered; echo $?)" in
        0) say "ALREADY REGISTERED: Pi package (pre-existing; survives rollback)" ;;
        2) say "INCOMPLETE (preview): pi executable not found; registration state unknown"; conflicts=$((conflicts + 1)) ;;
        *) say "LINK: Pi package registration ($PI_SETTINGS)"; count=$((count + 1)) ;;
    esac
    say "Summary: $count resources to install; $conflicts conflicts/invalid/missing-tool entries"
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
    [ -d "$AGENTS_SRC_DIR" ] || fail "OpenCode agent adapters not found: $AGENTS_SRC_DIR"
    check_no_symlink_parents "$HOME_DIR/.agents/skills"
    check_no_symlink_parents "$(dirname "$GLOBAL_COMMAND")"
    check_no_symlink_parents "$GLOBAL_AGENTS"
    if [ -f "$MANIFEST" ] && manifest_relocation_evidence; then
        relocation_error
    fi
    local previous new_manifest tmp conflicts=0 src name dst rel
    previous="$(read_manifest)"; new_manifest="$previous"
    # Managed entries whose recorded source no longer exists keep the install
    # from claiming success; they are never pruned automatically (see --doctor).
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] || continue
        case "$src" in "$PI_KEY":*) continue ;; esac
        if [ ! -e "$src" ]; then
            say "OBSOLETE (kept; see --doctor for manual removal): $rel"
            conflicts=$((conflicts + 1))
        fi
    done <<EOF
$previous
EOF
    mkdir -p "$GLOBAL_SKILLS" "$(dirname "$GLOBAL_COMMAND")" "$GLOBAL_AGENTS" "$(dirname "$MANIFEST")"
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
        new_manifest="$(printf '%s\n%s\t%s' "$new_manifest" "$(rel_under_home "$GLOBAL_COMMAND")" "$COMMAND_SRC" | sed '/^$/d')"
        say "LINKED: OpenCode /spec-and-tasks command"
    fi
    for src in "$AGENTS_SRC_DIR"/*.md; do
        [ -e "$src" ] || continue
        name="$(basename "$src")"; dst="$GLOBAL_AGENTS/$name"; rel=".config/opencode/agents/$name"
        if ! is_agent "$src"; then say "INVALID (skipped): agent adapter $name"; conflicts=$((conflicts + 1))
        elif link_points_to "$dst" "$src"; then say "ALREADY LINKED: OpenCode agent $name"
        elif [ -e "$dst" ] || [ -L "$dst" ]; then say "CONFLICT (preserved): OpenCode agent $name"; conflicts=$((conflicts + 1))
        else
            ln -s "$src" "$dst"; printf '%s\n' "$dst" >> "$TMP_TRACK"
            say "LINKED: OpenCode agent $name"
            new_manifest="$(printf '%s\n%s\t%s' "$new_manifest" "$(rel_under_home "$dst")" "$src" | sed '/^$/d')"
        fi
    done
    # The Pi entry is written into the manifest optimistically: a failed
    # registration leaves a diagnosable, rerunnable state that --doctor and a
    # repeated --apply both resolve; the entry is never recorded when the
    # registration already existed before this apply (it is not owned).
    local pi_state="absent"
    case "$(pi_registered; echo $?)" in
        0) say "ALREADY REGISTERED: Pi package (pre-existing; ownership not recorded)"; pi_state="pre-existing" ;;
        2) say "INCOMPLETE: pi executable not found; Pi package registration skipped"; conflicts=$((conflicts + 1)) ;;
        *)
            new_manifest="$(printf '%s\n%s\t%s' "$new_manifest" "$PI_SETTINGS_REL" "$PI_KEY:$SCRIPT_DIR" | sed '/^$/d')"
            ;;
    esac
    printf '%s\n' "$new_manifest" > "$tmp"
    mv "$tmp" "$MANIFEST"
    TMP_MANIFEST=""
    trap - EXIT
    if ! rm -f "$TMP_TRACK"; then
        say "WARNING: install committed; temporary rollback journal remains at $TMP_TRACK"
    fi
    TMP_TRACK=""
    if [ "$pi_state" = "absent" ]; then
        if PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi install "$SCRIPT_DIR"; then
            say "REGISTERED: Pi package ($PI_SETTINGS)"
            pi_state="installed"
        else
            say "INCOMPLETE: Pi package registration failed; rerun --apply after fixing the cause"
            conflicts=$((conflicts + 1))
        fi
    fi
    if [ "$conflicts" -gt 0 ]; then
        say "RESULT: INCOMPLETE ($conflicts unresolved entries; nothing was overwritten). Run --doctor for details; resolve and rerun --apply."
        exit 1
    fi
    say "RESULT: COMPLETE. Run --doctor for diagnostics."
}

rollback() {
    check_no_symlink_parents "$HOME_DIR/.agents/skills"
    check_no_symlink_parents "$(dirname "$GLOBAL_COMMAND")"
    check_no_symlink_parents "$GLOBAL_AGENTS"
    [ -f "$MANIFEST" ] || { say "No installer manifest; nothing to roll back."; exit 0; }
    if manifest_relocation_evidence; then
        relocation_error
    fi
    local rel src dst removed=0 preserved=0 manifest_contents
    manifest_contents="$(read_manifest)" || fail "invalid installer manifest; no rollback changes were made"
    while IFS="$(printf '\t')" read -r rel src; do
        [ -n "${rel:-}" ] || continue
        case "$src" in
            "$PI_KEY":*)
                case "$(pi_registered; echo $?)" in
                    0)
                        if pi_remove_registration; then
                            say "REMOVED: Pi package registration ($PI_SETTINGS)"; removed=$((removed + 1))
                        else
                            say "PRESERVED (manual recovery: run \"pi remove $SCRIPT_DIR\"): Pi registration"; preserved=$((preserved + 1))
                        fi
                        ;;
                    2)
                        say "PRESERVED (manual recovery: install Pi, then run \"pi remove $SCRIPT_DIR\"): Pi registration"; preserved=$((preserved + 1))
                        ;;
                    *)
                        say "PRESERVED (registration changed since install): Pi package"; preserved=$((preserved + 1))
                        ;;
                esac
                ;;
            *)
                dst="$(dst_of_rel "$rel")"
                if link_points_to "$dst" "$src"; then rm "$dst"; say "REMOVED: $rel"; removed=$((removed + 1))
                else say "PRESERVED (changed since install): $rel"; preserved=$((preserved + 1)); fi
                ;;
        esac
    done <<EOF
$manifest_contents
EOF
    rm "$MANIFEST"
    rmdir "$(dirname "$MANIFEST")" 2>/dev/null || :
    rmdir "$GLOBAL_AGENTS" 2>/dev/null || :
    rmdir "$(dirname "$GLOBAL_AGENTS")" 2>/dev/null || :
    rmdir "$(dirname "$GLOBAL_COMMAND")" 2>/dev/null || :
    rmdir "$(dirname "$GLOBAL_SKILLS")" 2>/dev/null || :
    rmdir "$HOME_DIR/.agents" 2>/dev/null || :
    rmdir "$HOME_DIR/.config/opencode" 2>/dev/null || :
    rmdir "$HOME_DIR/.config" 2>/dev/null || :
    say "Rollback complete: $removed removed; $preserved preserved."
}

doctor() {
    local issues=0 count=0 src name declared path target profile entry rel dependency manifest_contents dst
    say "agent-brains global distribution diagnostics"
    report_roots
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
    if [ -d "$OPENCODE_CONFIG_ROOT/skills" ]; then
        for path in "$OPENCODE_CONFIG_ROOT/skills"/*; do
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
        elif manifest_relocation_evidence; then
            cat <<'RELOCATION'
FAIL: CHECKOUT RELOCATED — managed links point into another checkout.
No mutation is performed here. Manual recovery: verify the recorded sources,
remove old-checkout links manually, then rerun --apply from this checkout.
(Existing links pointing into the old location are not owned here.)
RELOCATION
            issues=$((issues + 1))
        elif manifest_contents="$(read_manifest)"; then
            while IFS="$(printf '\t')" read -r rel entry; do
                [ -n "${rel:-}" ] || continue
                case "$entry" in
                    "$PI_KEY":*)
                        case "$(pi_registered; echo $?)" in
                            0) : ;;
                            2) say "FAIL: managed Pi registration cannot be verified (pi executable missing): $rel"; issues=$((issues + 1)) ;;
                            *) say "FAIL: managed Pi registration missing (rerun --apply to restore): $rel"; issues=$((issues + 1)) ;;
                        esac
                        continue
                        ;;
                esac
                path="$HOME_DIR/$rel"
                if ! link_points_to "$path" "$entry"; then say "FAIL: installer link missing or changed: $rel"; issues=$((issues + 1)); fi
                if [ ! -e "$entry" ]; then
                    say "OBSOLETE: managed source is missing (manual removal of the global link required; nothing is pruned automatically): $rel"
                    issues=$((issues + 1))
                fi
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
    if [ -d "$GLOBAL_AGENTS" ]; then
        for path in "$GLOBAL_AGENTS"/*; do
            [ -e "$path" ] || [ -L "$path" ] || continue
            name="$(basename "$path")"
            if [ -L "$path" ]; then
                target="$(readlink "$path")"; case "$target" in /*) ;; *) target="$(cd "$(dirname "$path")" && pwd -P)/$target" ;; esac
                if [ ! -e "$path" ]; then say "FAIL: broken global agent link: $name"; issues=$((issues + 1))
                elif [ -f "$AGENTS_SRC_DIR/$name" ] && [ "$target" != "$AGENTS_SRC_DIR/$name" ]; then say "DUPLICATE: global agent '$name' differs from the canonical adapter (preserved)"; issues=$((issues + 1)); fi
            elif [ -f "$AGENTS_SRC_DIR/$name" ]; then say "DUPLICATE: global agent '$name' exists as user content (preserved)"; issues=$((issues + 1)); fi
        done
    else say "INFO: global OpenCode agents directory is not present"; fi
    for src in "$AGENTS_SRC_DIR"/*.md; do
        [ -e "$src" ] || continue
        name="$(basename "$src")"; dst="$GLOBAL_AGENTS/$name"
        if ! is_agent "$src"; then say "FAIL: agent adapter $name has no primary frontmatter"; issues=$((issues + 1))
        elif [ ! -e "$dst" ] && [ ! -L "$dst" ]; then say "INFO: OpenCode agent $name is not installed"; fi
    done
    case "$(pi_registered; echo $?)" in
        0) say "INFO: Pi package registration for this checkout is present" ;;
        2) say "INFO: pi executable not found; Pi registration not checked" ;;
        *) say "INFO: Pi package registration for this checkout is not present" ;;
    esac
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
    if [ -f "$PI_SETTINGS" ]; then
        say "INFO: Pi settings file is present (values not read)"
    else say "INFO: Pi settings file is absent"; fi
    if [ "$issues" -eq 0 ]; then say "Result: no structural issues found."; else say "Result: $issues issue(s) found."; fi
    [ "$issues" -eq 0 ]
}

PI_SETTINGS_REL="$PI_SETTINGS"
case "$PI_SETTINGS" in
    "$HOME_DIR"/*) PI_SETTINGS_REL="${PI_SETTINGS#"$HOME_DIR"/}" ;;
    *) : ;; # env-overridden root outside --home: recorded by absolute path
esac

case "$MODE" in
    preview) preview ;;
    apply) apply_install ;;
    rollback) rollback ;;
    doctor) doctor ;;
    update-upstream) exec "$SCRIPT_DIR/update-upstream-skills.sh" ;;
esac
