/**
 * U1 — developer write-path guard (main-review-hardening, finding F2).
 *
 * Two layers are pinned here:
 * 1. the pure policy in `src/write-guard.ts` (Pi-free);
 * 2. the tools a developer child actually runs with: the definitions from
 *    `guardedWriteTools()` — the same objects `PiAgentRunner.run()` pushes as
 *    custom tools, which override Pi's built-in write/edit by name — and a
 *    real `createAgentSession` proving the session registry resolves "write"
 *    to the guarded definition, not the built-in one.
 *
 * Executing a definition rejects on refusal: Pi's agent loop converts a
 * thrown tool error into a tool result with `isError: true` carrying the
 * message (verified in pi-agent-core's `executePreparedToolCall`), which is
 * how the model sees the refused path.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

import { checkWritablePath } from "../src/write-guard.ts";
import { guardedWriteTools, resolveTools } from "../src/pi/pi-agent-runner.ts";
import { DEVELOPER_TOOLS } from "../src/workflows/feature.ts";
import type { AgentRunRequest } from "../src/agent.ts";

interface Workspace {
  repo: string;
  outside: string;
}

function makeWorkspace(): Workspace {
  const outside = mkdtempSync(join(tmpdir(), "pi-brain-guard-out-"));
  const repo = mkdtempSync(join(tmpdir(), "pi-brain-guard-repo-"));
  mkdirSync(join(repo, "src", "nested"), { recursive: true });
  writeFileSync(join(repo, "src", "nested", "a.ts"), "export const a = 1;\n");
  mkdirSync(join(repo, ".git", "hooks"), { recursive: true });
  writeFileSync(join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 0\n");
  mkdirSync(join(repo, ".pi"), { recursive: true });
  writeFileSync(join(repo, ".pi", "pi-brain.json"), "{}\n");
  writeFileSync(join(outside, "secret.txt"), "outside\n");
  // Symlink escape channels: a link out of the repo, and a link that reaches
  // a protected directory from a benign-looking name.
  symlinkSync(outside, join(repo, "link-out"));
  symlinkSync(join(repo, ".git"), join(repo, "link-git"));
  // A link that stays inside the repo must remain usable.
  symlinkSync(join(repo, "src", "nested"), join(repo, "link-in"));
  // Dangling symlinks: lstat succeeds but realpath fails with ENOENT because
  // the targets do not exist. An ENOENT-only walk would mistake them for
  // "new file" and follow them out of the repo (U1 review P1 — not TOCTOU:
  // the links stay unchanged during the operation).
  symlinkSync(join(outside, "new.txt"), join(repo, "link-dangling-out.txt"));
  symlinkSync(join(".git", "hooks", "new-hook"), join(repo, "link-dangling-git.txt"));
  // ".." inside a symlink target: link-via points outside the repo, so the
  // target `link-via/../victim.txt` must be evaluated component by component
  // (outside/sub -> .. -> outside -> victim.txt), NOT collapsed lexically to
  // repo/victim.txt (U1 review P1 — no concurrency needed, the links are
  // constant during the operation).
  mkdirSync(join(outside, "sub"));
  symlinkSync(join(outside, "sub"), join(repo, "link-via"));
  symlinkSync("link-via/../victim.txt", join(repo, "dangling-rel.txt"));
  // Same bypass with an absolute target containing "..".
  symlinkSync(join(repo, "link-via") + "/../victim-abs.txt", join(repo, "dangling-abs.txt"));
  return { repo, outside };
}

function cleanWorkspace(ws: Workspace): void {
  rmSync(ws.repo, { recursive: true, force: true });
  rmSync(ws.outside, { recursive: true, force: true });
}

// --- pure policy -----------------------------------------------------------

test("an absolute path outside the repo root is refused", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath(join(ws.outside, "planted.txt"), ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("planted.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("a ../ escape is refused", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("../escape.txt", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("../escape.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test(".git/hooks/pre-commit is refused", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath(".git/hooks/pre-commit", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /\.git/);
    assert.ok(verdict.reason.includes(".git/hooks/pre-commit"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test(".pi/pi-brain.json is refused", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath(".pi/pi-brain.json", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /\.pi/);
    assert.ok(verdict.reason.includes(".pi/pi-brain.json"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("a symlink to the outside is refused, even for a file that does not exist yet", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("link-out/planted.txt", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("link-out/planted.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("a symlinked ancestor that reaches a protected directory is refused", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("link-git/hooks/new-hook", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /\.git/);
    assert.ok(verdict.reason.includes("link-git/hooks/new-hook"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("nested in-repo paths are allowed, including through an in-repo symlink", async () => {
  const ws = makeWorkspace();
  try {
    assert.deepEqual(await checkWritablePath("src/nested/a.ts", ws.repo), { allowed: true });
    assert.deepEqual(await checkWritablePath("src/nested/deeper/mod.ts", ws.repo), { allowed: true });
    assert.deepEqual(await checkWritablePath("link-in/b.ts", ws.repo), { allowed: true });
    // Segment equality matters, not prefix: .gitignore stays editable.
    assert.deepEqual(await checkWritablePath(".gitignore", ws.repo), { allowed: true });
  } finally {
    cleanWorkspace(ws);
  }
});

test("creating a file that does not exist yet is allowed", async () => {
  const ws = makeWorkspace();
  try {
    // Neither the file nor its directory exists: the policy must resolve
    // through the nearest existing ancestor and allow the creation.
    const verdict = await checkWritablePath("src/brand-new-dir/brand-new.ts", ws.repo);
    assert.deepEqual(verdict, { allowed: true });
  } finally {
    cleanWorkspace(ws);
  }
});

// --- guarded tool definitions (what the developer child runs with) ----------

function devTools(ws: Workspace) {
  const tools = guardedWriteTools({ readOnly: false, cwd: ws.repo }, ws.repo);
  const write = tools.find((t) => t.name === "write");
  const edit = tools.find((t) => t.name === "edit");
  assert.ok(write, "guarded write tool present");
  assert.ok(edit, "guarded edit tool present");
  return { write, edit };
}

test("guardedWriteTools returns exactly write and edit for writable roles", () => {
  const ws = makeWorkspace();
  try {
    assert.deepEqual(
      guardedWriteTools({ readOnly: false, cwd: ws.repo }, ws.repo).map((t) => t.name),
      ["write", "edit"],
    );
  } finally {
    cleanWorkspace(ws);
  }
});

test("read-only roles get no guarded tools, keeping their tool set read-only", () => {
  const ws = makeWorkspace();
  try {
    assert.deepEqual(guardedWriteTools({ readOnly: true, cwd: ws.repo }, ws.repo), []);
  } finally {
    cleanWorkspace(ws);
  }
});

test("the write tool refuses an outside absolute path and touches nothing", async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    const before = readdirSync(ws.outside);
    // The write tool creates parent directories first, so the refusal names
    // the refused directory (resolved form); that is the identifying path.
    const refusedDir = realpathSync(ws.outside);
    await assert.rejects(
      write.execute("t1", { path: join(ws.outside, "planted.txt"), content: "evil\n" }, undefined, undefined, undefined as never),
      (err: unknown) => {
        assert.match((err as Error).message, /write guard/);
        assert.ok((err as Error).message.includes(refusedDir), (err as Error).message);
        return true;
      },
    );
    assert.deepEqual(readdirSync(ws.outside), before, "outside directory untouched");
    assert.equal(existsSync(join(ws.outside, "planted.txt")), false);
  } finally {
    cleanWorkspace(ws);
  }
});

test("the write tool refuses .git/hooks/pre-commit and leaves it unchanged", async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    await assert.rejects(
      write.execute("t2", { path: ".git/hooks/pre-commit", content: "#!/bin/sh\nevil\n" }, undefined, undefined, undefined as never),
      /\.git/,
    );
    assert.equal(readFileSync(join(ws.repo, ".git", "hooks", "pre-commit"), "utf-8"), "#!/bin/sh\nexit 0\n");
  } finally {
    cleanWorkspace(ws);
  }
});

test("the edit tool refuses .pi/pi-brain.json and leaves it unchanged", async () => {
  const ws = makeWorkspace();
  try {
    const { edit } = devTools(ws);
    await assert.rejects(
      edit.execute(
        "t3",
        { path: ".pi/pi-brain.json", edits: [{ oldText: "{}", newText: '{"evil": true}' }] },
        undefined,
        undefined,
        undefined as never,
      ),
      (err: unknown) => {
        // Pi's edit tool wraps operation failures, but the refused path must
        // still be identifiable in the tool error the model receives.
        assert.match((err as Error).message, /\.pi\/pi-brain\.json|write guard/);
        return true;
      },
    );
    assert.equal(readFileSync(join(ws.repo, ".pi", "pi-brain.json"), "utf-8"), "{}\n");
  } finally {
    cleanWorkspace(ws);
  }
});

test("the edit tool refuses a symlink to the outside and leaves the target unchanged", async () => {
  const ws = makeWorkspace();
  try {
    const { edit } = devTools(ws);
    await assert.rejects(
      edit.execute(
        "t4",
        { path: "link-out/secret.txt", edits: [{ oldText: "outside", newText: "pwned" }] },
        undefined,
        undefined,
        undefined as never,
      ),
      (err: unknown) => {
        assert.match((err as Error).message, /secret\.txt|write guard/);
        return true;
      },
    );
    assert.equal(readFileSync(join(ws.outside, "secret.txt"), "utf-8"), "outside\n");
  } finally {
    cleanWorkspace(ws);
  }
});

test("the write tool still writes nested in-repo paths and creates new files", async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    const result = await write.execute(
      "t5",
      { path: "src/fresh/module/new.ts", content: "export const n = 1;\n" },
      undefined,
      undefined,
      undefined as never,
    );
    assert.equal(existsSync(join(ws.repo, "src", "fresh", "module", "new.ts")), true);
    assert.equal(readFileSync(join(ws.repo, "src", "fresh", "module", "new.ts"), "utf-8"), "export const n = 1;\n");
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    assert.match(text, /Successfully wrote/);
  } finally {
    cleanWorkspace(ws);
  }
});

test("the edit tool still edits ordinary in-repo files", async () => {
  const ws = makeWorkspace();
  try {
    const { edit } = devTools(ws);
    const result = await edit.execute(
      "t6",
      { path: "src/nested/a.ts", edits: [{ oldText: "a = 1", newText: "a = 2" }] },
      undefined,
      undefined,
      undefined as never,
    );
    assert.equal(readFileSync(join(ws.repo, "src", "nested", "a.ts"), "utf-8"), "export const a = 2;\n");
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    assert.match(text, /Successfully replaced 1 block/);
  } finally {
    cleanWorkspace(ws);
  }
});

// --- session wiring: the registry must resolve "write"/"edit" to the guard --

test("a developer-shaped session exposes the guarded write/edit, not Pi's built-ins", async () => {
  const ws = makeWorkspace();
  // Hermetic agent dir: no user extensions/skills are loaded.
  const agentDir = mkdtempSync(join(tmpdir(), "pi-brain-guard-agent-"));
  const { session } = await createAgentSession({
    cwd: ws.repo,
    agentDir,
    sessionManager: SessionManager.inMemory(ws.repo),
    // Never prompted: only good enough for session construction.
    model: { provider: "fake", id: "fake-model", name: "Fake Model" } as never,
    customTools: guardedWriteTools({ readOnly: false, cwd: ws.repo }, ws.repo),
    tools: [...DEVELOPER_TOOLS],
  });
  try {
    const active = session.getActiveToolNames();
    assert.ok(active.includes("write"), `write active (got: ${active.join(",")})`);
    assert.ok(active.includes("edit"), `edit active (got: ${active.join(",")})`);

    const write = session.agent.state.tools.find((t) => t.name === "write");
    assert.ok(write, "write tool in agent state");
    // If the built-in had won the registry slot, this write would succeed.
    await assert.rejects(
      write!.execute("t7", { path: join(ws.outside, "session-escape.txt"), content: "x\n" }, undefined, undefined),
      /write guard/,
    );
    assert.equal(existsSync(join(ws.outside, "session-escape.txt")), false);

    const allowed = await write!.execute(
      "t8",
      { path: "src/via-session.ts", content: "export const s = 1;\n" },
      undefined,
      undefined,
    );
    const text = allowed.content.map((c) => ("text" in c ? c.text : "")).join("");
    assert.match(text, /Successfully wrote/);
    assert.equal(existsSync(join(ws.repo, "src", "via-session.ts")), true);
  } finally {
    session.dispose();
    rmSync(agentDir, { recursive: true, force: true });
    cleanWorkspace(ws);
  }
});

// --- review P1: a dangling symlink must not follow you out of the repo ------

test("a dangling symlink to the outside is refused by the policy", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("link-dangling-out.txt", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("link-dangling-out.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("a dangling symlink into .git is refused by the policy", async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("link-dangling-git.txt", ws.repo);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /\.git/);
    assert.ok(verdict.reason.includes("link-dangling-git.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test("the write tool refuses a dangling symlink out of the repo and creates nothing", async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    await assert.rejects(
      write.execute("t9", { path: "link-dangling-out.txt", content: "evil\n" }, undefined, undefined, undefined as never),
      (err: unknown) => {
        assert.match((err as Error).message, /write guard/);
        assert.ok((err as Error).message.includes("link-dangling-out.txt"), (err as Error).message);
        return true;
      },
    );
    assert.equal(existsSync(join(ws.outside, "new.txt")), false, "no file created outside the repo");
    assert.equal(readlinkSync(join(ws.repo, "link-dangling-out.txt")), join(ws.outside, "new.txt"));
  } finally {
    cleanWorkspace(ws);
  }
});

test("the write tool refuses a dangling symlink into .git and creates nothing", async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    await assert.rejects(
      write.execute("t10", { path: "link-dangling-git.txt", content: "evil\n" }, undefined, undefined, undefined as never),
      (err: unknown) => {
        assert.match((err as Error).message, /write guard/);
        assert.match((err as Error).message, /\.git/);
        return true;
      },
    );
    assert.equal(existsSync(join(ws.repo, ".git", "hooks", "new-hook")), false, "no file created under .git");
  } finally {
    cleanWorkspace(ws);
  }
});

// --- review P1: ".." inside a symlink target must follow the filesystem ----

test('a relative symlink target with ".." through an outside link is refused by the policy', async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("dangling-rel.txt", ws.repo);
    assert.equal(verdict.allowed, false, JSON.stringify(verdict));
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("dangling-rel.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test('an absolute symlink target with ".." through an outside link is refused by the policy', async () => {
  const ws = makeWorkspace();
  try {
    const verdict = await checkWritablePath("dangling-abs.txt", ws.repo);
    assert.equal(verdict.allowed, false, JSON.stringify(verdict));
    assert.match(verdict.reason, /outside the repository root/);
    assert.ok(verdict.reason.includes("dangling-abs.txt"), verdict.reason);
  } finally {
    cleanWorkspace(ws);
  }
});

test('the write tool refuses a ".." relative target and creates no file outside the repo', async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    await assert.rejects(
      write.execute("t11", { path: "dangling-rel.txt", content: "evil\n" }, undefined, undefined, undefined as never),
      (err: unknown) => {
        assert.match((err as Error).message, /write guard/);
        assert.match((err as Error).message, /outside the repository root/);
        return true;
      },
    );
    assert.equal(existsSync(join(ws.outside, "victim.txt")), false, "no file created outside the repo");
    assert.equal(readlinkSync(join(ws.repo, "dangling-rel.txt")), "link-via/../victim.txt");
  } finally {
    cleanWorkspace(ws);
  }
});

test('the write tool refuses an absolute ".." target and creates no file outside the repo', async () => {
  const ws = makeWorkspace();
  try {
    const { write } = devTools(ws);
    await assert.rejects(
      write.execute("t12", { path: "dangling-abs.txt", content: "evil\n" }, undefined, undefined, undefined as never),
      (err: unknown) => {
        assert.match((err as Error).message, /write guard/);
        assert.match((err as Error).message, /outside the repository root/);
        return true;
      },
    );
    assert.equal(existsSync(join(ws.outside, "victim-abs.txt")), false, "no file created outside the repo");
  } finally {
    cleanWorkspace(ws);
  }
});

// --- review P1: an explicit allowlist must not gain write tools -------------

test("guardedWriteTools only replaces write-capable tools already in the allowlist", () => {
  const ws = makeWorkspace();
  try {
    // The planner's explicit allowlist (feature.ts runPlanner) grants no
    // write capability, so nothing may be added to it.
    const planner = ["read", "grep", "find", "ls"];
    assert.deepEqual(guardedWriteTools({ readOnly: false, cwd: ws.repo, tools: planner }, ws.repo), []);
    // A role that declared only write gets only the guarded write.
    assert.deepEqual(
      guardedWriteTools({ readOnly: false, cwd: ws.repo, tools: ["read", "write"] }, ws.repo).map((t) => t.name),
      ["write"],
    );
    // No explicit allowlist: Pi's defaults include write/edit, both guarded.
    assert.deepEqual(
      guardedWriteTools({ readOnly: false, cwd: ws.repo }, ws.repo).map((t) => t.name),
      ["write", "edit"],
    );
  } finally {
    cleanWorkspace(ws);
  }
});

test("a planner-shaped session gains no write/edit tools", async () => {
  const ws = makeWorkspace();
  const agentDir = mkdtempSync(join(tmpdir(), "pi-brain-guard-planner-"));
  try {
    // Same request shape as the planner in src/workflows/feature.ts
    // (runPlanner): explicit read-only allowlist, readOnly NOT set. The
    // wiring below is exactly what PiAgentRunner.run() does with it.
    const request: AgentRunRequest = {
      runId: "run-planner-test",
      role: "planner",
      cwd: ws.repo,
      prompt: "",
      tools: ["read", "grep", "find", "ls"],
    };
    const custom = guardedWriteTools(request, ws.repo);
    assert.deepEqual(custom, [], "no guarded tools for a role without write in its allowlist");
    const { session } = await createAgentSession({
      cwd: ws.repo,
      agentDir,
      sessionManager: SessionManager.inMemory(ws.repo),
      model: { provider: "fake", id: "fake-model", name: "Fake Model" } as never,
      customTools: custom,
      tools: resolveTools(request, custom),
    });
    try {
      const active = session.getActiveToolNames();
      assert.ok(!active.includes("write"), `planner must not gain write (active: ${active.join(",")})`);
      assert.ok(!active.includes("edit"), `planner must not gain edit (active: ${active.join(",")})`);
      const names = session.agent.state.tools.map((t) => t.name);
      assert.ok(!names.includes("write"), `no write tool in agent state (got: ${names.join(",")})`);
      assert.ok(!names.includes("edit"), `no edit tool in agent state (got: ${names.join(",")})`);
      assert.ok(names.includes("read"), `read stays available (got: ${names.join(",")})`);
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    cleanWorkspace(ws);
  }
});
