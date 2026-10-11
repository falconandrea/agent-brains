## Standards

No documented-standard violations found in the T1–T3 implementation/setup/unlink/test diff. The README ownership contract (preserve real/foreign content, resolve ownership by destination, validate manifests before mutation, skip occupied skills, and remove directories only when empty; README.md:76-100, 215-225, 319-320) is followed by the changed shell paths. `.agents/AGENTS.md` contains Laravel-specific Pint/PHPStan commands; those do not apply to this root shell/test scope, and tooling-enforced issues are excluded.

Baseline smell judgement calls:

- **Possible Duplicated Code:** The ownership helper block (`link_destination`, `physical_destination`, `resolve_link`, `link_points_to`, `link_is_managed_skill`) is duplicated between `setup.sh:74-127` and `unlink.sh:66-119`; both comments require keeping the copies in sync. A shared shell helper would reduce drift.
- **Possible Duplicated Code:** The same hidden-entry glob and managed-link scan is repeated in `setup.sh:250-253`, `289-292`, `305-309`, `373-379`, and `unlink.sh:163-171`. The explicit “globs MUST match” comment signals a maintenance seam; one shared iterator/helper could centralize it.
