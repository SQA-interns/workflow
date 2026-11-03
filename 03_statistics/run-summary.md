# Run summary

> Written in: phase 7 · Source: `run-log.json` · Agent: writes

Write the tables from `run-log.json`; no estimates. The summary answers three questions: what did the run cost in agent time and money, what did it deliver, and what held it back. The sections **Run, Time, Commits and Cost and usage** sit between `<!-- auto:... -->` markers and are written by `tools/build-report.mjs` after the run (the agent's last commit comes before the report exists): do not fill them in and do not remove the markers.

## Run

<!-- auto:run -->
| Item | Value |
|---|---|
| Run id | tjan-single-agent-matt-workflow-contacts-run-1-opus-5-5-20261102T1947Z-be2f |
| Model, effort | claude-opus-5-5 |
| Template version | mattpocock-skills 1.3.1 (implement) |
| Run type, feature, base run | normal, none, – |
| Start commit | 96fb6d7 |
| End commit | d31b024 |
| Start, end | 2026-11-02T19:48:16Z, 2026-11-02T23:39:31Z |
<!-- /auto:run -->

## Time (human waiting excluded)

<!-- auto:time -->
| Phase | Wall | Waiting for the human | Agent time |
|---|---|---|---|
| 0 preflight-and-bootstrap | 5 min | 2 min | 3 min |
| 4 build | 48 min | 0 min | 48 min |
| 6 verify | 2 h 59 min | 2 h 23 min | 36 min |
| **Total** | **3 h 51 min** | **2 h 24 min** | **87 min** |

Waits over one hour: 1 (see the report).
<!-- /auto:time -->

## Outcome

<!-- One row per measure, values from `run-log.json`; keep the rows and their order. Goal: final run all green, no open Critical or High; always say what a coverage or mutation figure covers. -->

| Measure | Value |
|---|---|
| Frozen tests (phase 3) | not applicable: this workflow writes acceptance tests first per issue (red, then green) instead of freezing all tests in a separate phase |
| First complete run (phase 5, before any fix) | not recorded as a separate step; each issue's tests ran red before its implementation |
| Final run (phase 6) | 316 passed, 0 failed: backend 145 (96 REST acceptance with Auth Emulator tokens, 45 unit, 4 architecture), frontend 164 (Vitest, API client faked), 7 end-to-end (E2E-01..07). At the first end (dead015) it was 157 |
| Coverage, all tests | backend line 99.5 % / branch 93.8 % (JaCoCo, all backend tests, enforced in `mvn verify`); frontend line 100 % / branch 98.3 % (Vitest v8, `src/**`, enforced in `npm run coverage`). At dead015: 96.1 / 81.8 % and 81.0 / 73.4 % |
| Mutation score | backend 94.8 % raw (PIT 1.30.0, 596 killed of 629, all of `si.contacts.*`); frontend 93.77 % raw (Stryker 10, 1,746 killed of 1,862, `src/**`). No mutant marked equivalent |
| Quality gate | met (≥ 95 % lines, ≥ 90 % mutation, per component) at d31b024; not met at dead015 (no mutation testing, frontend 81 % lines) |
| Findings as found | code-review skill: Standards 4 hard (glossary terms) plus judgement calls; Spec 10 (0 Critical, 0 High) |
| Findings after triage | 0 open. Fixed in dead015: 2 Spec findings and the 4 Standards breaches. Fixed in the follow-up: quality gate, duplicate warning capped at 20, rate limit before sign-in, 400 vs 404 for malformed non-Member bodies, emulator tokens in backend tests. Kept as specified (D-6): Tag rename Revisions on Deleted contacts, Tag case on Restore |
| Hidden oracle (contacts experiment, after the run) | regression 5 of 32 passed (R01-R03, R06, R07), re-run at d31b024 with the same result as at dead015; 22 scenarios could not be set up because Contact create returns the Contact at the top level instead of `{contact: …}`; status names `MEMBER`/`INVITED` instead of `ACTIVE`/`PENDING`; rate limit counted per User, not per endpoint (R32). The run had no access to the template's API contract (D-1); code not changed for the oracle |
| Fix loops | 5 (code review 3 min; spec gaps; emulator tokens; backend gate; frontend gate), none needed a human |
| Code (lines) | backend 2,797 production / 2,795 test lines (Java, SQL, YAML); frontend 2,214 production / 2,787 test lines (TypeScript, CSS; 352 of them end-to-end). Non-blank, non-comment lines; cloc not installed |
| Duplication | not measured |

## Test measures

<!-- One row per component and level, from `docs/03_test-strategy.md` (measurement-scope.md defines every figure). Tests: passed / failed from the runner. Coverage: `unit` row = unit tests only, `non-unit` row = integration, acceptance, architecture and end-to-end tests that run under the coverage tool, `all levels` row = one merged report. Mutation score on the `all levels` row, with scope, tool, killed of total and the tests run. Write "—" where a cell does not apply. Goal: high coverage and mutation score. -->

| Component | Level | Tests passed / failed | Line coverage | Branch coverage | Mutation score (scope) | Tools |
|---|---|---|---|---|---|---|
| backend | acceptance | 96 / 0 | — | — | — | JUnit 6, Testcontainers PostgreSQL 16 and Firebase Auth Emulator, java.net.http |
| backend | integration | — | — | — | — | |
| backend | architecture | 4 / 0 | — | — | — | ArchUnit 1.3.2 |
| backend | unit | 45 / 0 | — | — | — | JUnit 6 |
| backend | non-unit | 100 / 0 | — | — | — | |
| backend | all levels | 145 / 0 | 99.5 % | 93.8 % | 94.8 % (`si.contacts.*`, 596 of 629, all tests except ArchitectureTest) | JaCoCo 0.8.12, PIT 1.30.0 |
| frontend | acceptance | — | — | — | — | |
| frontend | unit | included below | — | — | — | |
| frontend | non-unit | 164 / 0 (component and unit, API client faked) | 100 % | 98.3 % | — | Vitest 4.1.11, Testing Library, v8 |
| frontend | all levels | 164 / 0 | 100 % | 98.3 % | 93.77 % (`src/**`, 1,746 of 1,862) | Vitest v8, Stryker 10.0.0 |
| frontend + backend | end-to-end | 7 / 0 | — | — | — | Playwright 1.63.0, axe-core 4.13.0, Compose stack |

## Fix loops

<!-- one row per loop: finding, category, needs a human (yes/no), minutes, change. Goal: few, short, no human needed; note any loop that a template rule could have prevented. -->

| Loop | Finding | Category | Needs human | Minutes | Change |
|---|---|---|---|---|---|
| 1 | code review: `page` overflow gave 500; non-numeric query parameter gave 404 | correctness | no | 3 | 400 for both, tests added (dead015) |
| 2 | open spec gaps: non-Member with malformed body got 400; no limit before sign-in; duplicate matches capped at 20 | correctness | no | 2 | membership checked before the body, per-address limit, cap removed (493d3bf) |
| 3 | spec: backend tests must use Auth Emulator tokens | test design | no | 3 | emulator container in tests (937ed05) |
| 4 | quality gate, backend | test coverage | no | 58 wall | JaCoCo and PIT in the build, 45 unit tests, dead code removed (7e8dbd7) |
| 5 | quality gate, frontend | test coverage | no | 40 wall | coverage and Stryker, 109 tests added, shared loading hook (d31b024) |

## Commits

<!-- auto:commits -->
| Measure | Value |
|---|---|
| Commits | 18 (other 18) |
| Changed lines per commit: median / 90th percentile / largest | 395.5 / 1939 / 4647 |
| Files per commit (median) | 6.5 |
| Over the size guide / mixing concerns / in a burst | 44.4 % / 72.2 % / 5.6 % |
| Subject follows the format and the 72-character limit | 0 % |
| Active minutes between commits (median / longest gap) | 3.3 / 23.2 |
| Cost per commit (median) / per 100 changed lines | $0.96 / $0.23 |
<!-- /auto:commits -->

## Decisions and human interventions

<!-- counts of blocking and non-blocking decisions by category; one row per human intervention with cause and minutes. Goal: few blocking decisions; list every decision that a pre-approved answer in the inputs could have avoided. -->

| Decision | Blocking | What |
|---|---|---|
| D-0 | yes (1.6 min) | Where are the spec inputs? Operator: the GitHub issues; implement everything in this run |
| D-1 | no | API contract written from the issues (`docs/api-contract.md`) |
| D-2 | no | `GLOSSARY.md` and ADR-0001 replaced with spec #1's multi-tenant terms (originals kept in commit d13ae39) |
| D-3 | no | Backend tests first built emulator-format tokens by hand; in the follow-up they take tokens from the real Auth Emulator (hand-built only for expired, foreign-project and unsigned tokens) |
| D-4 | no | The over-10,000 Export rule is tested with a lowered configured limit |
| D-5 | yes (71.6 min, post-run turns) | The first end was dead015. The operator then asked to finish what spec #1 still missed (tests and the quality gate) in the same session, so the end moved to d31b024. The turns in between (push, ticket questions, closing #2-#14, these statistics) are recorded as a wait |
| D-6 | no | Two review points kept because the spec asks for them: Tag rename and delete write Revisions on Deleted contacts; a restored Tag takes the existing spelling |

D-0 and D-1 would have been avoided if the fixed API contract and tech stack were attached to the issues.

## Divergences

<!-- every departure from the rules, phases or stack, from `divergences[]`; "none" if none. Goal: none. -->

- **Workflow.** This run used the mattpocock-skills `implement` workflow over GitHub issues #2-#14 (spec #1), not the template's phases 0-7. Phases in `run-log.json` are mapped from the commits (see `phaseNote`).
- **Inputs.** The fixed API contract, tech stack file and requirement ids named in spec #1 were not available to the run. The agent wrote `docs/api-contract.md` from the issues and took the stack versions from a sibling template project (D-1). This is the main cause of the low hidden-oracle score.
- **Statistics after the run.** `run-log.json`, code size and the oracle were recorded after the run, from the transcript, git and the command output. The coverage and mutation figures come from the gates the follow-up added to the builds. No value was estimated.
- **Two ends.** The run first ended at dead015 (57 min wall, $15.66). The follow-up to d31b024 is in the same session and is counted in this summary. The time table's waits hold 72 min of post-run turns (D-5) and 71 min in which the agent waited on its own background mutation runs (PIT and Stryker): the tools count every gap over 10 min as a wait. The cost includes the post-run turns, because the tools do not exclude cost inside waits.
- **Oracle, manual steps.** The oracle ran with `docker compose` from the repository root (no `02_output/`), `FIREBASE_PROJECT_ID=demo-kontakti`, and `ORACLE_BASE_URL=http://127.0.0.1:8081` (the backend directly, because nginx on :8080 accepts only the `localhost` Host header).

## What held the run back

<!-- at most three items, each one sentence with its evidence: the largest causes of agent time and of cost (phase, tool class, waits, repeated fixes). -->

1. **Missing contract.** Without the template's API contract the API was designed from the issue text, so 27 of 32 hidden-oracle scenarios fail or cannot be set up despite 316 green own tests.
2. **Quality gate left out of the first pass.** The issues' gate (≥ 95 % lines, ≥ 90 % mutation) was not set up until the operator asked again. Closing it took about 100 min of wall time and 109 frontend and 45 backend tests, more than half of it waiting on mutation runs.
3. **Long context.** One session carried the whole run: 89 % of the cost was spent at over 150k context (average 350k, peak 641k per call).

## Cost and usage (calculated from the transcript)

<!-- auto:usage -->
| Item | Value |
|---|---|
| Cost (calculated from tokens and the prices in usage.md) | $32.36 ($32.36 without the cache rebuilds caused by waits) |
| Model calls / tool calls | 280 / 274 |
| Model time / tool time / agent time | 60 min / 35 min / 87 min |
| Session wall time | 3 h 51 min |
| Share of the cost at over 150k context | 89 % |
| Context per call (average / peak) | 350k / 641k |
| Approval prompts that needed a human | 1 (of 273 permission decisions; 2 rejected) |
<!-- /auto:usage -->

Everything is calculated from the session transcript, the sub-agent transcripts and git by `tools/build-report.mjs`; the complete report is in `03_statistics/results/` and the transcripts are backed up in `03_statistics/data/`.
