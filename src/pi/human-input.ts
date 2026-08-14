/**
 * HumanInput backed by Pi's TUI (spec §5.1, §15).
 *
 * Two modes, because of the open risk documented in docs/pi-brain/SPIKE.md:
 *
 *  - "live": ask immediately via ctx.ui.*, even while a child agent is running.
 *    Requires the spike to prove that a parent ctx stays usable mid-child-run.
 *  - "deferred": questions are queued and flushed at the next phase boundary,
 *    the child gets a "decide and state your assumption" answer. Always safe.
 *
 * The mode is chosen once, at construction, so workflow code never cares.
 */

import type {
  ConfirmQuestion,
  HumanInput,
  InputQuestion,
  SelectQuestion,
} from "../ports.ts";

/** Minimal surface we need from Pi's `ctx` — keeps this file honest. */
export interface PiUiContext {
  hasUI: boolean;
  ui: {
    confirm(opts: unknown): Promise<boolean>;
    select(opts: unknown): Promise<string>;
    input(opts: unknown): Promise<string>;
    editor(opts: unknown): Promise<string>;
    notify(message: string): void;
    setStatus?(message: string): void;
  };
}

export interface DeferredQuestion {
  question: string;
  reason?: string;
  options?: string[];
  askedAt: string;
}

export class PiHumanInput implements HumanInput {
  readonly #deferred: DeferredQuestion[] = [];
  readonly #liveCtx: () => PiUiContext;
  readonly #mode: "live" | "deferred";

  /**
   * @param liveCtx MUST return the *currently live* ctx, not a captured one —
   *   Pi's docs warn that captured contexts go stale after a session replacement.
   */
  constructor(liveCtx: () => PiUiContext, mode: "live" | "deferred" = "live") {
    this.#liveCtx = liveCtx;
    this.#mode = mode;
  }

  async confirm(q: ConfirmQuestion): Promise<boolean> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.defaultValue ?? false;
    return ctx.ui.confirm({
      message: q.message,
      description: q.detail,
      defaultValue: q.defaultValue ?? false,
    });
  }

  async select(q: SelectQuestion): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.options[0]!.value;
    return ctx.ui.select({ message: q.message, options: q.options });
  }

  async input(q: InputQuestion): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.defaultValue ?? "";
    return ctx.ui.input({
      message: q.message,
      placeholder: q.placeholder,
      defaultValue: q.defaultValue,
    });
  }

  async editor(q: { message: string; content: string }): Promise<string> {
    const ctx = this.#liveCtx();
    if (!ctx.hasUI) return q.content;
    return ctx.ui.editor({ message: q.message, content: q.content });
  }

  notify(message: string): void {
    const ctx = this.#liveCtx();
    if (ctx.hasUI) ctx.ui.notify(message);
  }

  /**
   * Called by the child agents' `ask_user` tool. In deferred mode it returns
   * null immediately and the question surfaces at the next phase boundary.
   */
  async askFromChild(q: { question: string; reason?: string; options?: string[] }): Promise<string | null> {
    if (this.#mode === "deferred") {
      this.#deferred.push({ ...q, askedAt: new Date().toISOString() });
      this.notify(`agent question queued: ${q.question}`);
      return null;
    }
    if (q.options && q.options.length > 0) {
      return this.select({
        message: q.question,
        options: q.options.map((o) => ({ label: o, value: o })),
      });
    }
    return this.input({ message: q.question, placeholder: q.reason });
  }

  /** Flush queued child questions at a phase boundary. */
  takeDeferred(): DeferredQuestion[] {
    return this.#deferred.splice(0, this.#deferred.length);
  }
}
