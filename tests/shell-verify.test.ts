/**
 * ShellVerifyRunner timeout and termination (F4): a hung verification command
 * must return a distinct non-success result, take its process tree with it,
 * and never hold the workflow — and through it the repository lock — hostage.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ShellVerifyRunner, type ShellVerifyOptions } from "../src/shell.ts";
import type { CommandResult } from "../src/ports.ts";

const cwd = (): string => mkdtempSync(join(tmpdir(), "pi-brain-verify-"));

const cmd = (command: string) => ({ label: "check", command, blocking: true });

/** Runs exactly one command and returns its (non-optional) result. */
async function runOne(
  options: ShellVerifyOptions,
  command: string,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const [result] = await new ShellVerifyRunner(cwd(), options).run([cmd(command)], signal);
  assert.ok(result, "exactly one result expected");
  return result;
}

/** Resolves when the pid no longer exists; fails the test if it survives. */
async function assertPidGone(pid: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // ESRCH: nothing left
    }
    if (Date.now() > deadline) assert.fail(`pid ${pid} is still alive after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const grandchildPid = (dir: string): number =>
  Number(readFileSync(join(dir, "grandchild.pid"), "utf8"));

test("a fast successful command reports exit 0 and its output", async () => {
  const result = await runOne({ timeoutMs: 10_000 }, "echo fast-success");
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /fast-success/);
  assert.notEqual(result.timedOut, true);
  assert.notEqual(result.cancelled, true);
});

test("an ordinary failure keeps its real exit code and output (bare constructor)", async () => {
  const result = await runOne({}, "echo oops >&2; exit 3");
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /oops/);
  assert.notEqual(result.timedOut, true);
  assert.notEqual(result.cancelled, true);
});

test("a hanging command times out with a distinct result instead of blocking the run", async () => {
  const started = Date.now();
  const result = await runOne({ timeoutMs: 250 }, "sleep 30");
  assert.ok(Date.now() - started < 10_000, "must not wait for the hung command");
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, 124);
  assert.match(result.output, /timed out/);
  assert.match(result.output, /250ms/);
  assert.match(result.output, /the command's process group was terminated\./);
  assert.notEqual(result.cancelled, true);
});

test("timeout termination kills the whole child-process tree, not just the shell", async () => {
  const dir = cwd();
  const runner = new ShellVerifyRunner(dir, { timeoutMs: 250, killGraceMs: 200 });
  const [result] = await runner.run([cmd("sleep 300 & echo $! > grandchild.pid; wait")]);
  assert.equal(result!.timedOut, true);
  await assertPidGone(grandchildPid(dir));
});

test("a tree that ignores SIGTERM is escalated to SIGKILL within the grace period", async () => {
  const dir = cwd();
  const runner = new ShellVerifyRunner(dir, { timeoutMs: 250, killGraceMs: 150 });
  const started = Date.now();
  const [result] = await runner.run([cmd("trap '' TERM; sleep 300 & echo $! > grandchild.pid; wait")]);
  assert.equal(result!.timedOut, true);
  assert.ok(Date.now() - started < 10_000, "SIGKILL escalation must stay bounded");
  await assertPidGone(grandchildPid(dir));
});

test("a grandchild that ignores SIGTERM and holds no pipes is still SIGKILLed after the shell closes", async () => {
  const dir = cwd();
  const runner = new ShellVerifyRunner(dir, { timeoutMs: 250, killGraceMs: 400 });
  // The SHELL dies to SIGTERM and its pipes close, but the background child
  // traps the signal and redirected its output away from them: only the
  // still-armed escalation timer can finish it.
  const [result] = await runner.run([
    cmd("( trap '' TERM; exec sleep 300 ) >/dev/null 2>&1 & echo $! > grandchild.pid; wait"),
  ]);
  assert.equal(result!.timedOut, true);
  await assertPidGone(grandchildPid(dir));
});

test("run() returns only after the terminated tree is actually dead", async () => {
  const dir = cwd();
  const runner = new ShellVerifyRunner(dir, { timeoutMs: 250, killGraceMs: 400 });
  const [result] = await runner.run([
    cmd("( trap '' TERM; exec sleep 300 ) >/dev/null 2>&1 & echo $! > grandchild.pid; wait"),
  ]);
  assert.equal(result!.timedOut, true);
  // No polling afterwards: the guarantee must hold at return time, or the
  // workflow (and the lock it releases) races a still-running process.
  try {
    process.kill(grandchildPid(dir), 0);
    assert.fail("the grandchild was still alive when run() returned");
  } catch (err) {
    assert.equal((err as NodeJS.ErrnoException).code, "ESRCH");
  }
});

test("a cancellation that started first is not overwritten by the later timeout", async () => {
  const abort = new AbortController();
  const runPromise = new ShellVerifyRunner(cwd(), { timeoutMs: 300, killGraceMs: 300 })
    .run([cmd("trap '' TERM; sleep 30")], abort.signal);
  setTimeout(() => abort.abort(), 100);
  const [result] = await runPromise;
  assert.equal(result!.cancelled, true);
  assert.notEqual(result!.timedOut, true, "the first cause must win");
  assert.equal(result!.exitCode, 143);
});

test("runaway output is truncated and the command killed, like exec's maxBuffer was", async () => {
  const started = Date.now();
  // The trailing sleep would outlive the producer: without the overflow
  // kill, only the (much later) timeout could end this, and the assertions
  // on elapsed time and timedOut would fail.
  const result = await runOne(
    { timeoutMs: 10_000 },
    "head -c 40000000 /dev/zero | base64; sleep 300",
  );
  assert.ok(Date.now() - started < 10_000, "overflow must not wait for the timeout");
  assert.notEqual(result.timedOut, true);
  assert.notEqual(result.cancelled, true);
  assert.ok(result.output.length <= 16 * 1024 * 1024 + 200, `output was ${result.output.length} chars`);
  assert.match(result.output, /produced more than .* characters of output/);
});

test("explicit cancellation aborts a hanging command promptly, distinctly, and kills its tree", async () => {
  const dir = cwd();
  const abort = new AbortController();
  const runPromise = new ShellVerifyRunner(dir, { timeoutMs: 60_000 }).run(
    [cmd("sleep 300 & echo $! > grandchild.pid; wait")],
    abort.signal,
  );
  setTimeout(() => abort.abort(), 150);
  const started = Date.now();
  const [result] = await runPromise;
  assert.ok(Date.now() - started < 10_000, "cancellation must resolve quickly");
  assert.equal(result!.cancelled, true);
  assert.notEqual(result!.exitCode, 0);
  assert.notEqual(result!.timedOut, true, "cancellation is not a timeout");
  await assertPidGone(grandchildPid(dir));
});

test("an abort between commands stops the run instead of starting the next one", async () => {
  const abort = new AbortController();
  const seen: string[] = [];
  const runner = new ShellVerifyRunner(cwd(), {
    timeoutMs: 10_000,
    onResult: (r) => {
      seen.push(r.command);
      if (seen.length === 1) abort.abort();
    },
  });
  const results = await runner.run([cmd("echo first"), cmd("echo second")], abort.signal);
  assert.equal(results.length, 1);
  assert.match(results[0]!.output, /first/);
});
