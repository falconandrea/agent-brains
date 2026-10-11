"""Replay the B pilot in a disposable fixture; never mutate the source checkout.

Usage: python3 docs/evals/test-review/run-mutation-experiment.py /tmp/output-dir
Requires Git and a Node version that executes TypeScript via type stripping.
"""

import json
from pathlib import Path
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[3]
TARGET = "73acb85f01db38ad34f61cf7bf9f1c56a183d8e5"
EXTRA_TESTS = r'''

test("pilot: unlink preserves a foreign whole-store skills symlink", () => {
  const project = newProject("pilot-foreign-store");
  mkdirSync(join(project, ".agents"), { recursive: true });
  symlinkSync(foreignStore, join(project, ".agents", "skills"));
  assert.equal(unlink(project).status, 0);
  assert.ok(isSymlink(join(project, ".agents", "skills")));
  assert.equal(linkDest(join(project, ".agents", "skills")), foreignStore);
  assert.equal(readFileSync(join(foreignStore, "foreign-skill", "SKILL.md"), "utf8"),
    "---\nname: foreign-skill\n---\nuser-managed\n");
});

test("pilot: unlink preserves a foreign workflows symlink", () => {
  const project = newProject("pilot-foreign-workflows");
  const foreignWorkflows = join(workspace, "pilot-user-workflows");
  mkdirSync(foreignWorkflows, { recursive: true });
  writeFileSync(join(foreignWorkflows, "feature.md"), "user workflow\n");
  mkdirSync(join(project, ".agents"), { recursive: true });
  symlinkSync(foreignWorkflows, join(project, ".agents", "workflows"));
  assert.equal(unlink(project).status, 0);
  assert.ok(isSymlink(join(project, ".agents", "workflows")));
  assert.equal(linkDest(join(project, ".agents", "workflows")), foreignWorkflows);
  assert.equal(readFileSync(join(foreignWorkflows, "feature.md"), "utf8"), "user workflow\n");
});
'''


def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    results = {}
    with tempfile.TemporaryDirectory(prefix="test-review-mutation-") as directory:
        fixture = Path(directory)
        for name in ("setup.sh", "unlink.sh", "tests/setup-unlink.test.ts"):
            path = fixture / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(subprocess.check_output(
                ["git", "show", f"{TARGET}:{name}"], cwd=ROOT))

        script = fixture / "unlink.sh"
        original = script.read_text()
        guards = (
            'if link_points_to "$skills" "$CANONICAL_SKILLS"; then',
            'if [ -n "$REPO_WORKFLOWS" ] && link_points_to "$target/workflows" "$REPO_WORKFLOWS"; then',
        )
        mutated = original
        for guard in guards:
            assert mutated.count(guard) == 1, f"Ambiguous mutation: {guard}"
            mutated = mutated.replace(guard, "if true; then")

        def run(label, expected):
            result = subprocess.run(
                ["node", "--test", "--test-reporter=tap", "tests/setup-unlink.test.ts"],
                cwd=fixture, capture_output=True, text=True, timeout=60)
            captured = result.stdout + result.stderr
            (output / f"{label}.txt").write_text(
                "\n".join(line.rstrip() for line in captured.splitlines()) + "\n")
            results[label] = {"exit_code": result.returncode}
            assert (result.returncode == 0) == expected, f"Unexpected {label} result"
            return result.stdout

        run("baseline-original", True)
        script.write_text(mutated)
        run("mutant-original-tests", True)
        tests = fixture / "tests/setup-unlink.test.ts"
        tests.write_text(tests.read_text() + EXTRA_TESTS)
        failed = run("mutant-with-probes", False)
        assert "not ok 25" in failed and "not ok 26" in failed, failed
        script.write_text(original)
        run("restored-with-probes", True)

    results["target"] = TARGET
    results["node"] = subprocess.check_output(["node", "--version"], text=True).strip()
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
