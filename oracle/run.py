#!/usr/bin/env python3
"""Run the hidden oracle of the contacts experiment against a finished run, in one command (template 1.9-ft).

    python3 run.py <run folder> [--features import,activity] [--results <folder>] [--keep-stack] [--no-report]

What it does, in order:
  1. reads Run label and Features from <run folder>/01_input/01_project/00_setup/run-config.md;
     --features overrides them;
  2. stops every Compose stack started from the run's 02_output/docker-compose.yml (for example the one the agent left
     running; volumes are kept), so the ports are free;
  3. starts the stack with the test settings of 02_design/api-contract.md (the Auth emulator the compose file starts by
     default, RATE_LIMIT_PER_MINUTE=10000) and runs `oracle.py main` for the base project and every feature; restarts it
     with RATE_LIMIT_PER_MINUTE=3 and runs `oracle.py ratelimit`; summarizes;
  4. stops the stack and deletes its data (`down -v`), unless --keep-stack;
  5. keeps the results outside the run folder, in <results> (default: oracle-results/<run label> next to the run
     folder), copies the three result files to <run folder>/03_statistics/results/oracle/ and rebuilds the run's report
     with build-report.mjs (node from PATH or nvm), unless --no-report.
Then: the privacy check of README.md, commit ("oracle <run label>") and push.

FIREBASE_PROJECT_ID (not a secret) and any ORACLE_* setting come from <run folder>/.env and are passed to the oracle
in its environment; no value is printed. The oracle creates its own Users in the emulator; it needs no credential. Standard library only (Python 3.10+). Never copy this folder into a run folder.
"""
import json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ("oracle-main.json", "oracle-ratelimit.json", "oracle-summary.json")


def die(msg):
    sys.exit(f"run.py: {msg}")


def arg(name):
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else None


def run_config(run):
    f = run / "01_input" / "01_project" / "00_setup" / "run-config.md"
    if not f.exists():
        die(f"no run-config.md in {run}; is this a run folder?")
    return {m[1].strip(): m[2].strip() for m in re.finditer(r"^- ([^:\n]+):[ \t]*(.*)$", f.read_text(encoding="utf-8"), re.M)}


def read_env(path):
    env = {}
    for line in path.read_text(encoding="utf-8").replace("\r", "").split("\n"):
        m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if m and not line.lstrip().startswith("#"):
            v = m[2].strip()
            env[m[1]] = v[1:-1] if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"" else v
    return env


def sh(cmd, cwd, env=None, check=True):
    print("$ " + " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=cwd, env=env)
    if check and r.returncode != 0:
        raise RuntimeError(f"command failed with exit {r.returncode}: {' '.join(cmd[:4])} ...")
    return r.returncode


def reachable(url, seconds):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=5)
            return True
        except urllib.error.HTTPError:
            return True   # any HTTP answer means the backend is up
        except Exception:
            time.sleep(2)
    return False


def find_node():
    node = shutil.which("node")
    if node:
        return node
    versions = sorted(Path.home().glob(".nvm/versions/node/v*/bin/node"),
                      key=lambda p: [int(x) for x in re.findall(r"\d+", p.parent.parent.name)])
    return str(versions[-1]) if versions else None


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
        print(__doc__)
        sys.exit(2)
    run = Path(sys.argv[1]).resolve()
    out_dir = run / "02_output"
    compose = out_dir / "docker-compose.yml"
    env_file = run / ".env"
    if not compose.exists():
        die(f"no 02_output/docker-compose.yml in {run}")
    if not env_file.exists():
        die(f"no .env in {run}; the stack needs the run's settings (POSTGRES_PASSWORD, FIREBASE_PROJECT_ID)")

    cfg = run_config(run)
    label = cfg.get("Run label") or run.name
    folder_label = label.replace("/", "_")
    feats_raw = arg("--features") or cfg.get("Features") or "none"
    features = [f.strip().lower() for f in feats_raw.split(",") if f.strip() and f.strip().lower() != "none"]
    feature_arg = ",".join(features) or "none"
    results = Path(arg("--results")).resolve() if arg("--results") else run.parent / "oracle-results" / folder_label
    if results == run or run in results.parents:
        die("the results must stay outside the run folder")
    results.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        (results / f).unlink(missing_ok=True)

    project = "oracle-" + re.sub(r"[^a-z0-9_-]+", "-", folder_label.lower()).strip("-")
    dotenv = read_env(env_file)
    base_env = {**os.environ, **{k: v for k, v in dotenv.items() if k == "FIREBASE_PROJECT_ID" or k.startswith("ORACLE_")}}
    base_env.pop("FIREBASE_AUTH_EMULATOR_HOST", None)   # the compose file's own default (its emulator service) must apply
    dc = ["docker", "compose", "-p", project, "--env-file", str(env_file), "-f", str(compose)]
    base_url = base_env.get("ORACLE_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    auth_url = base_env.get("ORACLE_AUTH_URL", "http://127.0.0.1:9099").rstrip("/")
    print(f"run {label} | features {feature_arg} | results {results}")

    # 2. free the ports: stop every stack of this compose file (the agent's, an earlier oracle's)
    ls = subprocess.run(["docker", "compose", "ls", "-a", "--format", "json"], capture_output=True, text=True)
    if ls.returncode != 0:
        die("docker compose is not available: " + (ls.stderr or "").strip()[:200])
    for p in json.loads(ls.stdout or "[]"):
        if str(compose) in [os.path.realpath(c) for c in (p.get("ConfigFiles") or "").split(",") if c]:
            sh(["docker", "compose", "-p", p["Name"], "down"], out_dir, check=False)

    failed = []
    try:
        for phase, limit, build in (("main", "10000", True), ("ratelimit", "3", False)):
            env = {**base_env, "RATE_LIMIT_PER_MINUTE": limit}
            sh(dc + ["up", "-d", "--force-recreate", "--wait"] + (["--build"] if build else []), out_dir, env)
            if not reachable(base_url + "/api/me", 120):
                raise RuntimeError(f"the backend does not answer at {base_url}")
            if not reachable(auth_url + "/", 60):
                raise RuntimeError(f"the Auth emulator does not answer at {auth_url}")
            if sh([sys.executable, "-B", str(HERE / "oracle.py"), phase, "--feature", feature_arg,
                   "--out", str(results / f"oracle-{phase}.json")], out_dir, env, check=False) != 0:
                failed.append(phase)
        sh([sys.executable, "-B", str(HERE / "summarize.py"), str(results)], out_dir)
    finally:
        if "--keep-stack" in sys.argv:
            print(f"stack kept running as project {project}; stop it with: docker compose -p {project} down -v")
        else:
            sh(dc + ["down", "-v"], out_dir, base_env, check=False)

    if failed:
        print(f"\nWARNING: oracle phase(s) {', '.join(failed)} crashed (output above); their scenarios are missing from the summary.")

    # 5. into the run's statistics, then the report
    if "--no-report" in sys.argv:
        print(f"\nresults in {results} (not copied: --no-report)")
        return
    dest = run / "03_statistics" / "results" / "oracle"
    dest.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        (dest / f).unlink(missing_ok=True)
        if (results / f).exists():
            shutil.copy2(results / f, dest / f)
    node = find_node()
    if node and (run / "03_statistics" / "tools" / "build-report.mjs").exists():
        sh([node, "03_statistics/tools/build-report.mjs", "--run", "03_statistics", "--no-backup"], run, check=False)
    else:
        print("node not found: rebuild the report with node 03_statistics/tools/build-report.mjs --run 03_statistics --no-backup")
    print(f"\nresults in {results} and {dest}\nnext: the privacy check (oracle/README.md), then commit \"oracle {folder_label}\" and push")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        die(str(e))
