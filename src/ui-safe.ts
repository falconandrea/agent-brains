/**
 * Best-effort UI effects (U8, F6).
 *
 * A stale/removed Pi context can make any UI call throw. The run's
 * authoritative state — the persisted outcome, the run log, the lock — must
 * not depend on the TUI, so every effect that only REPORTS to the human is
 * best-effort: the launcher's outcome/error notify, the terminal bell, the
 * status line, the per-agent-event status and the workflow's internal
 * notifications. A throw is reported exactly once on stderr and swallowed.
 *
 * Errors from interactions that REQUIRE an answer (confirm/select/input/
 * editor) are deliberately NOT routed here: they are control flow
 * (UserDismissedError, aborts) and must reach the workflow.
 */

import type { HumanInput } from "./ports.ts";

/**
 * Run a UI effect best-effort: a throw is reported once on stderr and
 * swallowed, so it can never change the run outcome, emit a
 * `workflow.failed` after `workflow.outcome`, reject the detached promise or
 * skip the lock release.
 */
export function safeUi(effect: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`pi-brain: ${effect} failed: ${message}\n`);
  }
}

/**
 * Wrap a HumanInput so only the informational `notify` channel is
 * best-effort (U8, F6). The response-requiring interactions are delegated
 * untouched: their errors are control flow and must propagate.
 */
export function withBestEffortNotify(human: HumanInput): HumanInput {
  return {
    confirm: (q) => human.confirm(q),
    select: (q) => human.select(q),
    input: (q) => human.input(q),
    editor: (q) => human.editor(q),
    notify: (message) => safeUi("notify", () => human.notify(message)),
  };
}
