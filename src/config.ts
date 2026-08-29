/**
 * Configuration with the precedence required by the spec (§7):
 *
 *   built-in defaults
 *     -> global   ~/.pi/agent/pi-brain/config.json
 *     -> project  <repo>/.pi/pi-brain.json
 *     -> workflow / invocation overrides (passed in code)
 *
 * NOTE (deviation from the spec, deliberate): config is JSON, not YAML, so the
 * package stays dependency-free. Swap in a `yaml` dep later if it ever hurts —
 * only `loadFile()` below has to change.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface RoleConfig {
  /** Pi provider id, e.g. "zai" | "openai-codex" | "openrouter" | "anthropic". */
  provider?: string;
  /** Provider-specific model id. Never hard-coded in core logic. */
  model?: string;
  thinking?: ThinkingLevel;
  readOnly?: boolean;
  enabled?: boolean;
}

export interface PiBrainConfig {
  roles: Record<string, RoleConfig>;
  /** Manual stack override; when set, detection is skipped. */
  stack?: string;
  /** Extra skill roots beyond the bundled .agents/skills. */
  skillRoots: string[];
  maxReviewRounds: number;
  /** Developer retries allowed on failing deterministic checks, before escalating. */
  maxVerifyRetries: number;
  /** Explicit verification commands; when empty they are resolved per stack. */
  verify: string[];
  verbosity: "compact" | "normal" | "verbose";
  autoCommit: false;
  notifications: { bell: boolean; os: boolean };
}

export const DEFAULT_MAX_REVIEW_ROUNDS = 2;

export const DEFAULT_CONFIG: PiBrainConfig = {
  roles: {
    planner: { thinking: "medium" },
    developer: { provider: "zai", thinking: "high" },
    reviewer: { provider: "openai-codex", thinking: "high", readOnly: true },
    "security-reviewer": { readOnly: true, enabled: false },
  },
  skillRoots: [],
  maxReviewRounds: DEFAULT_MAX_REVIEW_ROUNDS,
  maxVerifyRetries: 2,
  verify: [],
  verbosity: "normal",
  autoCommit: false,
  notifications: { bell: true, os: false },
};

export const GLOBAL_CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-brain", "config.json");
export const projectConfigPath = (repoRoot: string): string =>
  join(repoRoot, ".pi", "pi-brain.json");

function loadFile(path: string): Partial<PiBrainConfig> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<PiBrainConfig>;
  } catch (err) {
    throw new Error(`invalid pi-brain config at ${path}: ${(err as Error).message}`);
  }
}

/** Shallow merge, except `roles` which merges per role. */
function merge(base: PiBrainConfig, layer: Partial<PiBrainConfig>): PiBrainConfig {
  const roles = { ...base.roles };
  for (const [role, cfg] of Object.entries(layer.roles ?? {})) {
    roles[role] = { ...roles[role], ...cfg };
  }
  return { ...base, ...layer, roles };
}

/**
 * Config comes from hand-edited files, so it is untrusted input. An unbounded
 * or non-numeric budget would turn the developer<->reviewer loop into an
 * infinite one, so those are validated rather than trusted.
 */
export function normalizeConfig(raw: PiBrainConfig): { config: PiBrainConfig; warnings: string[] } {
  const warnings: string[] = [];

  const bounded = (value: unknown, fallback: number, key: string, max = 10): number => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max) {
      return value;
    }
    warnings.push(`${key}: expected an integer between 0 and ${max}, got ${JSON.stringify(value)} — using ${fallback}`);
    return fallback;
  };

  const verbosity = ["compact", "normal", "verbose"].includes(raw.verbosity as string)
    ? raw.verbosity
    : ((): PiBrainConfig["verbosity"] => {
        warnings.push(`verbosity: unknown value ${JSON.stringify(raw.verbosity)} — using "normal"`);
        return "normal";
      })();

  const verify = Array.isArray(raw.verify) && raw.verify.every((c) => typeof c === "string")
    ? raw.verify
    : ((): string[] => {
        warnings.push("verify: expected an array of shell commands — ignoring it");
        return [];
      })();

  return {
    config: {
      ...raw,
      maxReviewRounds: bounded(raw.maxReviewRounds, DEFAULT_CONFIG.maxReviewRounds, "maxReviewRounds"),
      maxVerifyRetries: bounded(raw.maxVerifyRetries, DEFAULT_CONFIG.maxVerifyRetries, "maxVerifyRetries"),
      verbosity,
      verify,
      stack: typeof raw.stack === "string" && raw.stack !== "" ? raw.stack : undefined,
      autoCommit: false, // never configurable to true (spec §5.5)
    },
    warnings,
  };
}

export function loadConfig(
  repoRoot: string,
  overrides: Partial<PiBrainConfig> = {},
): { config: PiBrainConfig; warnings: string[] } {
  const merged = [
    loadFile(GLOBAL_CONFIG_PATH),
    loadFile(projectConfigPath(repoRoot)),
    overrides,
  ].reduce(merge, DEFAULT_CONFIG);
  return normalizeConfig(merged);
}

export function roleConfig(config: PiBrainConfig, role: string): RoleConfig {
  return config.roles[role] ?? {};
}
