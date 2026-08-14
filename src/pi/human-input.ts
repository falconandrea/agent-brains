/**
 * HumanInput backed by Pi's TUI (spec §5.1, §15).
 *
 * NOTE: Pi's UI API is POSITIONAL, not object-based — `confirm(title, message)`,
 * `select(title, options)`, `input(title, placeholder)`, `setStatus(key, text)`
 * — and select/input/editor return `undefined` when the user dismisses the
 * dialog. Verified against @earendil-works/pi-coding-agent 0.84.2 types.
 *
 * Two modes, because of the open risk in docs/pi-brain/SPIKE.md:
 *
 *  - "live": ask immediately, even while a child agent is running. Requires the
 *    spike to prove a parent ctx stays usable mid-child-run.
 *  - "deferred": queue the question, tell the child to assume and continue,
 *    flush at the next phase boundary. Always safe.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  ConfirmQuestion,
  HumanInput,
  InputQuestion,
  SelectQuestion,
} from "../ports.ts";

export interface DeferredQuestion {
  question: string;
  reason?: string;
  options?: string[];
  askedAt: string;
}

export class UserDismissedError extends Error {
  constructor(what: string) {
    super(`the user dismissed the ${what} dialog`);
    this.name = "UserDismissedError";
  }
}

const STATUS_KEY = "pi-brain";

export class PiHumanInput implements HumanInput {
  readonly #deferred: DeferredQuestion[] = [];
  readonly #liveCtx: () => ExtensionContext;
  readonly #mode: "live" | "deferred";

  /**
   * @param liveCtx MUST return the *currently live* ctx, not one captured
   *   earlier — Pi's docs warn captured contexts go stale after a session
   *   replacement.
   */
  constructor(liveCtx: () => ExtensionContext, mode: "live" | "deferred" = "live") {
    this.#liveCtx = liveCtx;
    this.#mode = mode;
  }

  async confirm(q: ConfirmQuestion): Promise<boolean> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.defaultValue ?? false;
    return ctx.ui.confirm(q.message, q.detail ?? "");
  }

  async select(q: SelectQuestion): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.options[0]!.value;
    const labels = q.options.map((o) => o.label);
    const picked = await ctx.ui.select(q.message, labels);
    if (picked === undefined) throw new UserDismissedError("select");
    const match = q.options.find((o) => o.label === picked);
    return match ? match.value : picked;
  }

  async input(q: InputQuestion): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.defaultValue ?? "";
    const answer = await ctx.ui.input(q.message, q.placeholder);
    if (answer === undefined) throw new UserDismissedError("input");
    return answer;
  }

  async editor(q: { message: string; content: string }): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.content;
    const edited = await ctx.ui.editor(q.message, q.content);
    return edited ?? q.content;
  }

  notify(message: string): void {
    const ctx = this.#liveCtx();
    if (ctx.hasUI) ctx.ui.notify(message);
  }

  status(text: string | undefined): void {
    const ctx = this.#liveCtx();
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, text);
  }

  /**
   * Called by a child agent's `ask_user` tool. In deferred mode it returns null
   * immediately and the question surfaces at the next phase boundary.
   */
  async askFromChild(q: {
    question: string;
    reason?: string;
    options?: string[];
  }): Promise<string | null> {
    if (this.#mode === "deferred") {
      this.#deferred.push({ ...q, askedAt: new Date().toISOString() });
      this.notify(`agent question queued: ${q.question}`);
      return null;
    }
    try {
      if (q.options && q.options.length > 0) {
        return await this.select({
          message: q.question,
          options: q.options.map((o) => ({ label: o, value: o })),
        });
      }
      return await this.input({ message: q.question, placeholder: q.reason });
    } catch (err) {
      // A dismissed dialog must not kill the child run.
      if (err instanceof UserDismissedError) return null;
      throw err;
    }
  }

  /** Flush queued child questions at a phase boundary. */
  takeDeferred(): DeferredQuestion[] {
    return this.#deferred.splice(0, this.#deferred.length);
  }
}
