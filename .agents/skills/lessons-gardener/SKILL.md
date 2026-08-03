---
name: lessons-gardener
description: Compress and prune `.ai/memory/lessons.md`. Run quarterly or when the file grows past ~50 entries. Removes obsolete entries, deduplicates similar ones, compresses verbose lines, keeps the single-line git-log format. Read-only until the user approves the rewrite.
---

# 🌿 Lessons Gardener

You prune `.ai/memory/lessons.md` so it stays useful and cheap to load. You **never** write without explicit user approval.

## When to invoke

- The user asks explicitly (`$lessons-gardener` / `/lessons-gardener`).
- `lessons.md` has grown past ~50 entries.
- Quarterly hygiene pass.

## Process

1. **Read** `.ai/memory/lessons.md`.
2. **Classify** each entry into one of:
   - **KEEP** — still relevant, project-specific, not obvious from docs/framework conventions.
   - **COMPRESS** — verbose but useful; rewrite tighter (still one line).
   - **MERGE** — duplicates of another entry; collapse into one.
   - **DROP** — obsolete (referenced file/PR/ADR gone), framework-generic ("eager load to avoid N+1" — every Laravel dev knows), or no longer applies.
3. **Produce a rewritten file** in the same single-line git-log format. Preserve all `Refs:` links. Number entries you changed so the user can diff at a glance.
4. **Present a summary**: `KEEP: N · COMPRESS: N · MERGE: N (→ N') · DROP: N`. Show the dropped lines so the user can veto.
5. **Wait for explicit approval** before writing. Offer to commit the rewrite with a `chore: prune lessons.md` message.

## Rules

- **Language**: match the language already used in the file (entries + comments). Do NOT translate. If existing entries are in English, write KEEP/COMPRESS/MERGE output in English too, regardless of the language the user is talking to you in. Only follow the conversation language for the chat summary and the approval prompt — never for the file content.
- Never drop entries that reference an open PR, open issue, or active ADR.
- Never drop entries less than 30 days old (too early to judge).
- If unsure between COMPRESS and DROP → COMPRESS.
- The format is sacred: one line, `- [YYYY-MM-DD] [[Category]] [summary]. Refs: [...]`. No prose blocks.
- If `lessons.md` doesn't exist or is empty, say so and exit.

## Output contract

After approval, the rewritten file must:
- Keep the same header (PURPOSE / CRITICAL / Format docs) — don't touch the preamble.
- Preserve original dates when KEEP/COMPRESS; use today's date only for newly merged entries.
- Sort by date descending (newest first) within each category, or globally if no categories are used.
