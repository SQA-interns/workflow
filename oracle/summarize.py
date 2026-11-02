#!/usr/bin/env python3
"""Combine oracle-main.json and oracle-ratelimit.json of one run into a summary.

    python summarize.py <folder with the oracle JSON files>

Prints one line per scenario and writes oracle-summary.json with the regression pass rate
(R01-R32) and one pass rate per feature (I01-I13, A01-A14, ...) plus all features together. "harness" means the scenario could not be checked
(for example the Auth emulator did not create a User); it counts as not passed and is reported as is.
"""
import json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # the Windows console code page cannot show č, š, ž
folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
results, feature, prefixes = {}, "none", {}
for phase in ("main", "ratelimit"):
    f = folder / f"oracle-{phase}.json"
    if f.exists():
        data = json.loads(f.read_text(encoding="utf-8"))
        results.update(data["results"])
        if phase == "main":
            feature = data.get("feature", feature)
            prefixes = data.get("featurePrefixes") or {}


def rate(prefix):   # one scenario letter, or a tuple of them
    ids = sorted(k for k in results if k.startswith(prefix))
    passed = sum(results[k]["result"] == "pass" for k in ids)
    return {"passed": passed, "total": len(ids), "rate": round(passed / len(ids), 3) if ids else None,
            "failed": [k for k in ids if results[k]["result"] == "fail"],
            "harness": [k for k in ids if results[k]["result"] == "harness"]}


# perFeature: one pass rate per feature (read by the 1.9-ft report); featureScenarios: all features together
summary = {"feature": feature, "features": list(prefixes), "regression": rate("R"),
           "featureScenarios": rate(tuple(prefixes.values())) if prefixes else None,
           "perFeature": {f: rate(p) for f, p in prefixes.items()},
           "scenarios": {k: results[k]["result"] for k in sorted(results)}}
for k in sorted(results):
    print(f"{k:5s} {results[k]['result']}")
reg = summary["regression"]
print(f"regression: {reg['passed']} of {reg['total']}")
for f, fs in summary["perFeature"].items():
    print(f"feature {f}: {fs['passed']} of {fs['total']}")
(folder / "oracle-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"written {folder / 'oracle-summary.json'}")
