# Metrics

> Owner: Experiment lead · Read in: every phase and post-run · Agent: read-only

Experiment measurement only. Record observed values; never estimate. An unobservable value stays `null` with a `<field>Reason`.

Goal column: **↓** lower is better, **↑** higher is better, **=** should equal the stated value, **i** information for interpreting other numbers.

## Principles

- **Human waiting is not part of the result.** Agent time is wall time minus every wait for a human. A wait over one hour also lets the 1-hour prompt cache expire, and the call after it writes the whole context again; that rebuild is a cost of the wait, so `usage.costUsdExclWaits` removes it. Compare runs on agent time and `costUsdExclWaits`.
- **Record only what only you can see, and with the clock tool.** The agent records what happened (waits, loops, decisions, deviations, test and quality results). Timestamps come from `tools/stat.mjs`, never from memory or estimates. Everything that can be computed from the transcripts and git is computed after the run by `tools/build-report.mjs`, so the run spends no calls on it.
- **Make runs comparable.** Say what a number covers. Scope, level and tool of coverage, mutation score and code size are defined in `general/quality/measurement-scope.md`.

## 1. Agent, during the run → `run-log.json`

Phase 0, first action: `node 03_statistics/tools/stat.mjs init`. It creates `run-log.json` from the template, a unique `runId`, the start time and commit, the transcript path and the environment. It prints what it wrote.

| Field | When | How | Goal |
|---|---|---|---|
| `runId`, `model`, `effort`, `templateVersion`, `start`, `startCommit`, `transcript`, `environment` | phase 0 | written by `stat.mjs init` from `run-config.md`, git and the host | i |
| `phases[].start`, `phases[].end` | every phase boundary | `stat.mjs phase <n> start` and `stat.mjs phase <n> end`; a start also closes the previous phase, `phase 7 end` also sets `end` and `finalCommit` | ↓ agent time per phase |
| `humanInterventions[]` | every time the agent waits for the human or the human acts, including stops, restarts and installs | `stat.mjs wait start <cause> "<reason>" [decisionId]` when you ask or stop, `stat.mjs wait end` when work resumes. `cause`: `decision`, `environment`, `approval`, `session`, `other` | ↓ count and minutes; every minute here is excluded from agent time |
| `firstTestRun`, `finalTestRun` | first full run before fixes; last full run | edit the file: `passed`, `failed` and `byLevel` (`unit`, `integration`, `acceptance`, `architecture`, `e2e` counts) | first: ↓ failed (defects the first run found); final: ↑ passed, `failed` = 0 |
| `acceptanceCriteria` | end of phase 3; changes in phase 4 | `total` criteria, `frozenTests`, `frozenTestChanges[]` as `{decisionId, reason}` | ↑ criteria covered by tests; ↓ frozen-test changes (each one needed a human) |
| `findings` | end of phase 6 | counts by severity, as found | ↓ |
| `openAtEnd` | end of phase 6 | Critical, High and Medium findings still open after triage | = 0 for Critical and High |
| `fixLoops[]` | each verify → fix → re-verify loop | `{loop, findings, category, needsHuman, change, start, end}`. `category`: `test-gap`, `security-config`, `dependency`, `defect`, `process`, `tooling`. `start` is the first fix action, `end` the clean re-check (UTC, `date -u +%FT%TZ`) | ↓ minutes per loop; a loop that repeats across runs belongs in the template |
| `decisions[]` | each decision record | `{id, type, phase, category, start, end}`; `type` `blocking` or `non-blocking`; `category`: `environment`, `dependency`, `security-finding`, `frozen-test`, `requirement`, `other`; `end` = when resolved | ↓ blocking; a category that repeats across runs can be answered in advance |
| `divergences[]` | whenever the run departs from `AGENTS.md`, `working-rules.md`, `phases.md` or the stack | `{phase, ref, divergence}`; includes steps done without the required question, scope reduced, versions replaced | = 0; each one makes the run less comparable |
| `codeMetrics` | phase 5, updated in phase 6 for a changed component | per component: `productionLoc`, `testLoc`, `lineCoverage` and `branchCoverage` as `{unit, nonUnit, all}`, `mutation` as `{score, scoreAdjusted, scoreCovered, killed, equivalent, total, covered, scope, tests, tool, excluded}`, plus complexity and duplication; scope, level and counting as in `general/quality/measurement-scope.md` | ↑ coverage and mutation score (always with scope); = 0 duplication |
| `codeMetrics.gate` | phase 5, updated in phase 6 | the quality gate of `general/quality/measurement-scope.md`: `thresholds`, `perComponent` (`lineMet`, `mutationMet`, shortfalls in points), `mutationRounds` and `testsAtFirstMutation` per component, `met` | `met` true; few rounds |

`commits[]` and `commitSummary` are not recorded by the agent: the post-run step reads them from `git log`.

## 2. Post-run session → `run-log.json`, `results/`, `data/`

Started automatically by the Stop and SessionEnd hooks in `.claude/settings.json` once `run-log.json` has an `end`; if the hooks did not run, in a new session whose only task is: "Run `node 03_statistics/tools/build-report.mjs --run 03_statistics` and report what it prints. Do not change anything else." Nothing is typed in by hand. The script:

1. measures the run from the session transcript(s), the sub-agent transcripts next to them and `git log`, and stores `time`, `usage`, `environment`, `commits`, `commitSummary` in `run-log.json`;
2. copies the transcripts to `03_statistics/data/` (committed with the run, so the measuring can be repeated on any machine; the recorded path is used when it exists, the copy otherwise);
3. writes everything it generates to `03_statistics/results/`: `run-report.html` (every attribute with goal, direction and value), `measurements.json`, `usage-summary.md`, `commits.csv`, `transcript.md` (readable session, needs Python 3);

Options: `--no-write` leaves `run-log.json` and `usage.md` alone, `--no-md` skips `transcript.md`, `--no-backup` skips `data/`. If `transcript` is missing from `run-log.json`, find the session with `py 03_statistics/tools/claude_chat_to_md.py --list`, put the path of its `.jsonl` in `transcript` (a resumed run lists every session file in `transcripts`) and run the script again. Without any transcript the report still builds from phases and recorded waits; cost, tokens, model and tool time, context and cache rebuilds are then not recorded.

| Field | What it is | Goal |
|---|---|---|
| `time.agentMin` | sum over phases of wall time minus waits (recorded interventions and idle gaps above 10 minutes in the transcript) | ↓ |
| `time.humanWaitMin`, `time.waitsOver60Min`, `time.longWaits[]` | excluded waiting, and each wait over an hour with its cause | ↓; = 0 waits over an hour |
| `time.modelMin`, `time.toolMin` | transcript time spent generating and running tools | ↓; tool time shows what to automate or speed up |
| `time.unrecordedIdleMin` | idle time in the transcript that `humanInterventions` does not cover | = 0 (a recording gap) |
| `time.phaseChecks` | phase boundaries written by `stat.mjs` against typed ones, and implausible timestamps | all via `stat.mjs`, no issues |
| `time.byPhase[]` | wall, wait, agent, model and tool minutes per phase | ↓ in phases 0, 1, 2, 7 (overhead); phases 4 to 6 hold the real work |
| `usage.inputTokens`, `outputTokens`, `thinkingTokens`, `cacheReadTokens`, `cacheWriteTokens`, `modelCalls` | sums over every model call, each call counted once, sub-agents included | ↓ |
| `usage.toolCalls` | total, errors, per tool name | ↓ calls and errors |
| `usage.costUsd` | tokens × the prices in `usage.md`, per model | ↓ |
| `usage.costUsdExclWaits` | `costUsd` minus the cache rebuilds that followed a wait over an hour | ↓ (the comparison figure) |
| `usage.cacheRebuilds[]` | each cache write above 150k tokens, the wait before it and its extra cost | = none caused by waits |
| `usage.subagents` | sub-agent calls, transcripts found, their cost (inside `costUsd`) | i; a call without a transcript is a measuring gap |
| `usage.byPhase[]` | calls, tokens, cost and average context per phase | ↓ in late phases, where context is largest |
| `usage.context` | peak and average context tokens per call, share of calls above 150k | ↓ (every call re-reads the whole context) |
| `usage.toolTimeByCategory` | minutes and calls per command class (backend build, mutation, e2e, …) | ↓ for the largest classes |
| `commits[]` | per commit: phase, type, files, changed lines (without logs, lock files, generated folders), concerns touched, size and message checks, minutes since the previous commit (waits removed), model calls and cost since the previous commit | commits small and finished: ≤ 15 files and ≤ 400 lines, one concern, `<type>: <summary> (IDs)` |
| `commitSummary` | counts, median and maximum size, shares over the size guide, mixed, with a correct message, in a burst (within a minute of the previous), cost and minutes between commits, cost per 100 lines | ↓ oversize, mixed and burst; ↑ correct messages |
| `environment` | operator, machine, plan, permission mode (from `run-config.md`), the host the run started on (account, CPU, memory, working directory; read by `stat.mjs init`), operating system and tool versions (at the start), harness version, entry point, models, effort and permission modes seen (from the transcripts), measuring host | i; needed to explain differences between runs |

## 3. Human → `usage.md`

Prices before the post-run session (one row per model id, shape as in the file). After it only `Approval prompts` is yours; the other cells are filled automatically when empty, and anything you wrote stays. A mismatch between the harness's total and our calculation is reported in the last row.
