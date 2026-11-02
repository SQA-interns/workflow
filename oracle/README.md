# Hidden oracle

> Used after every run (normal, greenfield, brownfield) · **Never copy it into a run folder or mention it to the agent**

Black-box checks of a finished run of the contact management project through the fixed API (`02_design/api-contract.md` of the template) and the Firebase Auth Emulator. The same oracle judges every run, so the results are comparable.

| Group | Scenarios | Runs |
|---|---|---|
| Regression, the base project | R01–R31: User record, token rejection (none, garbage, wrong audience, expired), Workspaces, adding Members, pending invitations, unverified emails, last Owner, Role checks (403), isolation (404 identical to a missing Workspace on every endpoint, Contacts through another Workspace's path, search, Tags, Duplicates and Export of another Workspace), Contact create, rejections leave nothing, trimming, Slovenian characters, version conflict (409), delete and Restore, Attributes, Tags, Tag rename and delete, search (diacritics), filters, paging, Revisions and Restore of a Revision, immutable Revisions, Duplicate sets (email, phone, name, transitive), duplicate warning, Merge, Export (selection, filter, columns, text cells), purge, Workspace deletion. R32: rate limit | every run |
| Feature `import` | I01–I13: valid import, Export → import round trip, header matching, cells and Tags, all or nothing, row rule, invalid and duplicate headers, unreadable / empty / too large workbook, formula cell, Revisions, duplicate report, Roles, Slovenian characters | runs whose features include `import` |
| Feature `activity` | A01–A14: order and authors, names as of the Revision, delete and Restore, Merge, Tag rename, filters by author, change type, Contact and combined, paging, invalid parameters, purge, isolation, Viewer | runs whose features include `activity` |

Users are created in the emulator through its REST API, with verified emails; every generated name is letters only with a random tag, and every scenario creates its own Workspaces, so earlier data never disturbs the checks. UI-only criteria (the pages, the Slovenian texts, accessibility) are not checked by the oracle; the run's own frozen tests and phase 6 cover them. Standard library only (Python 3.10+).

## One command

```bash
python3 <this folder>/run.py <run folder>
```

It reads Run label and Features from the run's `run-config.md`, stops every stack started from the run's `02_output/docker-compose.yml`, starts the stack (the compose file's own Auth emulator, rate limit 10000), runs the base project and **every listed feature**, restarts it with rate limit 3 for R32, summarizes, stops it with `down -v`, keeps the results in `oracle-results/<run label>/` next to the run folder, copies them to `03_statistics/results/oracle/` and rebuilds the report. Options: `--features import,activity` (override), `--results <folder>`, `--keep-stack`, `--no-report`. Then the privacy check below, commit `oracle <run label>`, push.

If the stack runs on other ports, set `ORACLE_BASE_URL` (backend, default `http://127.0.0.1:8080`) and `ORACLE_AUTH_URL` (emulator, default `http://127.0.0.1:9099`) in the run's `.env`; `run.py` passes `ORACLE_*` and `FIREBASE_PROJECT_ID` through.

`summarize.py` prints every scenario and writes `oracle-summary.json` with the regression pass rate and one pass rate per feature; the template's report reads it. "harness" means the oracle could not set a scenario up (for example the emulator refused to create a User); it counts as not passed and is reported as is. Report results as they are: do not fix the run's code, and note any manual step (for example a setting the compose file did not pass through) in the run's notes.

A new feature for the oracle: write `feature_<name>(ctx)` in `oracle.py` with its own scenario letter, and add it to `FEATURES` at the end of the file.

## Manual run (when `run.py` cannot be used)

```bash
cd <run folder>/02_output
O=/path/to/contacts-feature-testing-experiment/oracle; R=/path/to/oracle-results/<run label>; mkdir -p "$R"
export FIREBASE_PROJECT_ID=demo-kontakti
RATE_LIMIT_PER_MINUTE=10000 docker compose --env-file ../.env up -d --build --force-recreate --wait
python3 $O/oracle.py main --feature <none|import|activity|import,activity> --out "$R/oracle-main.json"
RATE_LIMIT_PER_MINUTE=3 docker compose --env-file ../.env up -d --force-recreate --wait
python3 $O/oracle.py ratelimit --feature <same> --out "$R/oracle-ratelimit.json"
python3 $O/summarize.py "$R"
docker compose --env-file ../.env down -v
```

Then copy the three result files to `<run folder>/03_statistics/results/oracle/` and rebuild the report in the run folder: `node 03_statistics/tools/build-report.mjs --run 03_statistics --no-backup`.

## Privacy check before committing statistics

The transcript backup (`03_statistics/data/*.jsonl`) is committed with the run and contains everything the session printed. If the agent ever printed a value from `.env`, it would be published. Before every statistics or oracle commit, in the run folder (Git Bash or Linux), list the files that contain a `.env` value of 6 or more characters; it prints names only, never values:

```bash
for k in $(sed -n 's/^\([A-Z_]*\)=.*/\1/p' .env); do v="$(sed -n "s/^$k=//p" .env | tr -d '\r')"; [ ${#v} -ge 6 ] || continue; for f in $(git ls-files -co --exclude-standard); do grep -qF -- "$v" "$f" && echo "$f contains $k"; done; done
```

`FIREBASE_PROJECT_ID` (`demo-kontakti`), `FIREBASE_WEB_API_KEY` (`demo-api-key`) and `FIREBASE_AUTH_DOMAIN` (`localhost`) are not secrets and appear in the inputs on purpose: a file listed only for these keys is fine. A file listed for `POSTGRES_PASSWORD` or `NVD_API_KEY`: replace the value in that committed copy with `[REDACTED]` (never in the original session file under `~/.claude`), check the file is still valid, note it in the commit message and the run notes. Closing the run's session later rebuilds the report and copies the original transcript back into `data/`; do not commit that change, discard it.
