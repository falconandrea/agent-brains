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
  /** Explicit verification commands; when empty they are resolved per stack. */
  verify: string[];
  verbosity: "compact" | "normal" | "verbose";
  autoCommit: false;
  notifications: { bell: boolean; os: boolean };
}

export const DEFAULT_CONFIG: PiBrainConfig = {
  roles: {
    planner: { thinking: "medium" },
    developer: { provider: "zai", thinking: "high" },
    reviewer: { provider: "openai", thinking: "high", readOnly: true },
    "security-reviewer": { readOnly: true, enabled: false },
  },
  skillRoots: [],
  maxReviewRounds: 2,
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

export function loadConfig(
  repoRoot: string,
  overrides: Partial<PiBrainConfig> = {},
): PiBrainConfig {
  return [loadFile(GLOBAL_CONFIG_PATH), loadFile(projectConfigPath(repoRoot)), overrides].reduce(
    merge,
    DEFAULT_CONFIG,
  );
}

export function roleConfig(config: PiBrainConfig, role: string): RoleConfig {
  return config.roles[role] ?? {};
}
