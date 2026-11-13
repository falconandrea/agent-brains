<!-- pi-brain:feature "Create hello.txt containing exactly hello followed by one newline. Keep the existing check.test.js and AGENTS.md unchanged. No dependencies, refactors, commits or pushes. Use the configured verification node check.test.js. This is a tiny compatibility pilot; keep the plan and implementation minimal." -->
### Problem
The existing compatibility check expects a root-level `hello.txt`, but the file is absent.

### User Stories
- As a compatibility tester, I want `hello.txt` to contain the expected text so that the configured Node.js check passes.
- As a maintainer, I want the change isolated so that existing fixture files remain unchanged.

### Scope
- Add root-level `hello.txt`.
- Store exactly `hello` followed by one LF newline.
- Verify with `node check.test.js`.

### Out of Scope
- Changes to `check.test.js` or `AGENTS.md`.
- Dependencies, refactors, configuration changes, commits, or pushes.

### Acceptance Criteria
- `hello.txt` exists at the repository root.
- Its UTF-8 content is exactly `hello\n`, with no additional bytes.
- `node check.test.js` exits successfully when run from the repository root.
- `check.test.js` and `AGENTS.md` remain unchanged.
- The implementation changes no files other than `hello.txt`.

### Alternatives Considered
- Generate the file at runtime: rejected because a static file is simpler and directly satisfies the verifier.
- Modify the verifier: rejected because `check.test.js` must remain unchanged and already defines the required contract.

### Assumptions
- Verification runs from the repository root because `check.test.js` uses a relative file path.
- The existing Node.js runtime is sufficient; no package script or dependency setup is needed.

### Architecture/Components
- `hello.txt`: static compatibility fixture at the repository root.
- `check.test.js`: existing verifier and unchanged contract boundary.

### Data Flow
`node check.test.js` reads `hello.txt` as UTF-8 and compares its complete content with `hello\n`.

### Error Handling
No new error handling is needed; the verifier fails naturally if the file is missing or its content differs.

### Testing Strategy
Run `node check.test.js` from the repository root and confirm that only `hello.txt` was added.