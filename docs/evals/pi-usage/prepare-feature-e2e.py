"""Prepare identical disposable fixtures and frozen runtime copies for C4."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

repo = Path(__file__).resolve().parents[3]
root = Path(tempfile.mkdtemp(prefix="pi-c4-feature-", dir="/private/tmp"))
for name in ("home", "agent"):
    (root / name).mkdir()
catalog = Path.home() / ".pi/agent/models-store.json"
shutil.copyfile(catalog, root / "agent/models-store.json")
fixture = {
    ".gitignore": "node_modules/\n",
    "AGENTS.md": "# Fixture instructions\n\nC4-FEATURE-CONTEXT-MARKER\n\nKeep implementation dependency-free. Use node:test. Never commit or push.\n",
    "package.json": json.dumps({"name": "retry-fixture", "private": True, "type": "module", "scripts": {"test": "node --test"}}, indent=2) + "\n",
    "src/retry.js": "export function retryDelay(attempt, baseMs = 100) {\n  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('invalid attempt');\n  if (!Number.isFinite(baseMs) || baseMs < 0) throw new RangeError('invalid baseMs');\n  return baseMs * 2 ** attempt;\n}\n",
    "test/retry.test.js": "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { retryDelay } from '../src/retry.js';\ntest('existing delays', () => { assert.equal(retryDelay(0), 100); assert.equal(retryDelay(3, 25), 200); });\ntest('validation', () => { assert.throws(() => retryDelay(-1), RangeError); assert.throws(() => retryDelay(0, NaN), RangeError); });\n",
    "README.md": "# Retry fixture\n\n`retryDelay(attempt, baseMs = 100)` returns `baseMs * 2 ** attempt`.\nAttempt must be a nonnegative integer; baseMs a finite nonnegative number.\nInvalid arguments throw RangeError. Run `npm test`.\n",
}
revisions = {"before": "fb66860", "after": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()}
manifest = {"revisions": revisions, "fixture": fixture, "fixtureSha256": {k: hashlib.sha256(v.encode()).hexdigest() for k, v in fixture.items()}, "instrumentation": "One observation before session.dispose(): save request, actual systemPrompt and session.messages through globalThis.__piEvalCapture. No session behavior changed."}
for arm, rev in revisions.items():
    target = root / arm
    runtime = target / "runtime"
    runtime.mkdir(parents=True)
    archive = subprocess.check_output(["git", "archive", rev], cwd=repo)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(runtime, filter="data")
    (runtime / "node_modules").symlink_to(repo / "node_modules", target_is_directory=True)
    runner = runtime / "src/pi/pi-agent-runner.ts"
    source = runner.read_text()
    needle = "      unsubscribe();\n      session.dispose();"
    assert source.count(needle) == 1
    runner.write_text(source.replace(needle, "      unsubscribe();\n      globalThis.__piEvalCapture?.(request, session);\n      session.dispose();"))
    manifest[arm] = {"runnerOriginalSha256": hashlib.sha256(source.encode()).hexdigest(), "runnerInstrumentedSha256": hashlib.sha256(runner.read_bytes()).hexdigest()}
    cwd = target / "fixture"
    for name, content in fixture.items():
        path = cwd / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=cwd, check=True)
    subprocess.run(["git", "add", "."], cwd=cwd, check=True)
    env = {**os.environ, "GIT_AUTHOR_DATE": "2026-10-27T09:00:00Z", "GIT_COMMITTER_DATE": "2026-10-27T09:00:00Z"}
    subprocess.run(["git", "-c", "user.name=C4 Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "test: initialize retry fixture"], cwd=cwd, env=env, check=True)
    manifest[arm]["fixtureCommit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=cwd, text=True).strip()
# Both arms discover the exact same frozen skill store. No installed package
# or extension is registered in this disposable agent directory.
(root / "agent/skills").symlink_to(root / "after/runtime/.agents/skills", target_is_directory=True)
(root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(root)
