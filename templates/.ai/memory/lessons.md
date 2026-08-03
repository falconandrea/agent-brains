# Lessons Learned

> **PURPOSE**: Document mistakes, bugs, and their solutions so AI never repeats them.

> **CRITICAL**: AI must read this file at session start and check it before making changes.

---

## Entry Format

Each entry must be exactly **one line** following a git-log style format. Do not write multiple paragraphs or blocks. Keep details of the fix or decisions inside PRs, Task files, or Architectural Decision Records (ADRs), and link to them.

**Concision is mandatory.** A reader should grasp the lesson in <2 seconds. If you can't fit it in one line, the lesson is too generic — narrow it or drop it.

Format:
`- [YYYY-MM-DD] [[Category]] [One-line summary of mistake and fix]. Refs: [file-name](relative/path/to/file), [PR #ID], or [ADR-name](relative/path/to/adr)`

### What NOT to log (drop these)
- Generic framework knowledge anyone can google ("eager load to avoid N+1", "use transactions for atomic writes", "type your props").
- Bugs that were typos, one-off mistakes, or already-fixed-by-tooling (caught by Pint/PHPStan/ESLint).
- Vague entries without a concrete trigger ("be careful with timestamps").
- Entries older than 12 months with no living Refs.

### Good examples
`- [2026-07-12] [Laravel] Eager load 'profile' to prevent N+1 in /users index (only happens when profile is shown in table). Refs: [tasks-user.md](.ai/features/user/tasks-user.md), [PR #45]`
`- [2026-07-10] [Next] Don't import 'lodash' in Server Components — pulls 70KB into the bundle. Refs: [PR #43]`


---

## 📚 Lessons Log

_No lessons logged yet. Add single-line entries here as mistakes are resolved during development._

