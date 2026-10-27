"""Persist raw C4 evidence once; reconstruct fixtures from manifest + patch."""
import json
from pathlib import Path
import shutil
import subprocess
import sys

source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
destination.mkdir(parents=True, exist_ok=True)
manifest = destination.parent / "manifest.json"
original = source / "manifest.json"
if manifest.exists():
    if json.loads(manifest.read_text()) != json.loads(original.read_text()):
        raise ValueError("Shared fixture/runtime manifest differs; use a separate evidence directory")
else:
    shutil.copyfile(original, manifest)
for arm in ("before", "after"):
    origin = source / arm
    fixture = origin / "fixture"
    run_log = fixture / ".pi/pi-brain/runs" / f"c4-e2e-{arm}.jsonl"
    if not run_log.exists():
        continue  # This arm never ran (e.g. network-only preflight).
    target = destination / arm
    target.mkdir(exist_ok=True)
    for path in sorted(origin.glob("session-[0-9]*.json")):
        shutil.copyfile(path, target / path.name)
    for name in ("config.json", "tools.jsonl", "approval.json", "human.jsonl",
                 "plan-gate.json", "independent-tests.json"):
        path = origin / name
        if path.is_file():
            shutil.copyfile(path, target / path.name)
    shutil.copyfile(run_log, target / "run.jsonl")
    patch = subprocess.check_output(["git", "diff", "--binary", "HEAD"], cwd=fixture)
    if patch:
        (target / "tracked.patch").write_bytes(patch)
print(destination)
