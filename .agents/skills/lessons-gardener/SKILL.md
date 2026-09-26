---
name: lessons-gardener
description: Compress and prune `.ai/memory/lessons.md`, audit linked solution documents, and find broken references or duplicate diagnoses. Run quarterly or when the index grows past ~50 entries. Read-only until the user approves the rewrite.
---

# 🌿 Lessons Gardener

You prune `.ai/memory/lessons.md` and audit its solution references so project
memory stays useful and cheap to retrieve. You **never** write without explicit
user approval.

## When to invoke

- The user asks explicitly (`$lessons-gardener` / `/lessons-gardener`).
- `lessons.md` has grown past ~50 entries.
- Quarterly hygiene pass.

## Process

1. **Read** `.ai/memory/lessons.md`, then inventory
   `.ai/memory/solutions/**/*.md` without preloading every document.
2. **Audit solution-backed entries** mechanically:
   - each `Refs:` link resolves below `.ai/memory/`;
   - each solution has exactly one index entry;
   - no two entries or documents describe the same diagnosis;
   - category, directory, slug, and frontmatter agree; and
   - solutions older than 180 days are review candidates, never automatically
     stale or removable.
3. **Classify** each entry into one of:
   - **KEEP** — still relevant, project-specific, not obvious from docs/framework conventions.
   - **COMPRESS** — verbose but useful; rewrite tighter (still one line).
   - **MERGE** — duplicates of another entry; collapse into one.
   - **DROP** — obsolete (referenced file/PR/ADR gone), framework-generic ("eager load to avoid N+1" — every Laravel dev knows), or no longer applies.
4. **Inspect candidates only as needed.** Open a solution document when its
   link is broken, duplicated, apparently obsolete, or older than 180 days.
   Check its current references and documented verification before proposing a
   change. Age alone is not evidence of obsolescence.
5. **Produce a rewritten file** in the same single-line git-log format.
   Preserve resolving `Refs:` links. List any proposed solution-document edit
   separately; do not silently fold it into the index rewrite.
6. **Present a summary**: `KEEP: N · COMPRESS: N · MERGE: N (→ N') · DROP: N`
   plus `BROKEN REFS: N · DUPLICATE SOLUTIONS: N · REVIEW CANDIDATES: N`. Show
   every dropped line and every proposed solution edit so the user can veto.
7. **Wait for explicit approval** before writing. Approval must identify both
   the index rewrite and any solution documents it authorizes.

## Rules

- **Language**: match the language already used in the file (entries + comments). Do NOT translate. If existing entries are in English, write KEEP/COMPRESS/MERGE output in English too, regardless of the language the user is talking to you in. Only follow the conversation language for the chat summary and the approval prompt — never for the file content.
- Never drop entries that reference an open PR, open issue, or active ADR.
- Never drop entries less than 30 days old (too early to judge).
- Never delete an orphaned or old solution solely because it lacks an index
  entry or crossed the 180-day review threshold; verify its current relevance
  and propose the exact repair or removal.
- If unsure between COMPRESS and DROP → COMPRESS.
- The format is sacred: one line, `- [YYYY-MM-DD] [Category] [summary]. Refs: [...]`. No prose blocks.
- If `lessons.md` doesn't exist or is empty, say so and exit.

## Output contract

After approval, the rewritten file must:
- Keep the same header (PURPOSE / CRITICAL / Format docs) — don't touch the preamble.
- Preserve original dates when KEEP/COMPRESS; use today's date only for newly merged entries.
- Sort by date descending (newest first) within each category, or globally if no categories are used.
- Leave every retained solution with one resolving index link and no duplicate
  diagnosis.
