---
description: spec-and-tasks workflow — selectable primary agent that runs the shared "spec-and-tasks" catalog skill
mode: primary
---

Load the "spec-and-tasks" skill with the native skill tool (exact skill ID: "spec-and-tasks") and
follow its instructions for the user's request. The skill owns this workflow's
contract and boundaries; this adapter only starts it and must not duplicate,
replace, or reinterpret them.

If the skill tool is unavailable, the skill is absent, or skill loading is
denied by permissions, say so and stop. Do not search the filesystem for the
skill, do not reconstruct it from memory, and do not delegate the request.
