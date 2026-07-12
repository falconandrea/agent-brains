# Lessons Learned

> **PURPOSE**: Document mistakes, bugs, and their solutions so AI never repeats them.

> **CRITICAL**: AI must read this file at session start and check it before making changes.

---

## Entry Format

Each entry must be exactly **one line** following a git-log style format. Do not write multiple paragraphs or blocks. Keep details of the fix or decisions inside PRs, Task files, or Architectural Decision Records (ADRs), and link to them.

Format:
`- [YYYY-MM-DD] [[Category]] [One-line summary of mistake and fix]. Refs: [file-name](relative/path/to/file), [PR #ID], or [ADR-name](relative/path/to/adr)`

Example:
`- [2026-07-12] [Laravel] Eager load 'profile' to prevent N+1 query in user index. Refs: [tasks-user.md](.ai/features/user/tasks-user.md), [PR #45]`


---

## 📚 Lessons Log

_No lessons logged yet. Add single-line entries here as mistakes are resolved during development._

