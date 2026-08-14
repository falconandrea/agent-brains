/**
 * Parser for the `profiles/*.list` manifests already used by setup.sh.
 *
 * Format (kept identical on purpose — `main` still consumes it from bash):
 *   # comment
 *   @include <other-profile>
 *   <skill-name>
 *
 * Resolution mirrors setup.sh: recursive @include, comments/blanks dropped,
 * duplicates removed keeping first-occurrence order.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ProfileResolution {
  profile: string;
  skills: string[];
  /** Profiles visited, in resolution order (useful for diagnostics). */
  includes: string[];
}

export class ProfileNotFoundError extends Error {
  readonly profile: string;
  readonly path: string;

  constructor(profile: string, path: string) {
    super(`profile '${profile}' not found (looked for ${path})`);
    this.name = "ProfileNotFoundError";
    this.profile = profile;
    this.path = path;
  }
}

/** Strip a trailing `.md` — a few entries in common.list carry one. */
function normalizeSkillName(raw: string): string {
  return raw.trim().replace(/\.md$/, "");
}

export function resolveProfile(profilesDir: string, profile: string): ProfileResolution {
  const skills: string[] = [];
  const includes: string[] = [];
  const seenSkills = new Set<string>();
  const seenProfiles = new Set<string>();

  const visit = (name: string): void => {
    if (seenProfiles.has(name)) return; // cycle / diamond guard
    seenProfiles.add(name);
    includes.push(name);

    const path = join(profilesDir, `${name}.list`);
    if (!existsSync(path)) throw new ProfileNotFoundError(name, path);

    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("@include ")) {
        visit(line.slice("@include ".length).trim());
        continue;
      }

      const skill = normalizeSkillName(line);
      if (skill !== "" && !seenSkills.has(skill)) {
        seenSkills.add(skill);
        skills.push(skill);
      }
    }
  };

  visit(profile);
  return { profile, skills, includes };
}

export function listProfiles(profilesDir: string): string[] {
  return readdirSync(profilesDir)
    .filter((f) => f.endsWith(".list"))
    .map((f) => f.slice(0, -".list".length))
    .sort();
}
