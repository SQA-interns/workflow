# Feature experiment: contact management

> Separate repository, never cloned into a run folder · Shared by normal, greenfield and brownfield runs

The multi-tenant contact management project (template 1.9-ft, repository SQA-interns/workflow, branch `main`) gets features added in two ways, and every run is judged by the same hidden oracle:

| Run type | Features | Starts from |
|---|---|---|
| **normal** | none (baseline) | `main` of the template |
| **greenfield** | in the inputs from the start | `main` plus the feature's generated input files |
| **brownfield** | added as a prepared change request | the finished state of an earlier run plus the same feature as `change/` |

Features: `import` (Excel import in the Export's layout, US-014) and `activity` (Workspace activity feed, US-015). The results of all run types are compared with the same statistics, the same HTML report and the same hidden oracle.

This repository holds what the agent must never see: the features before they are given to a run, and the oracle. Keep it in its own folder **next to** the run folders, never inside one.

## Contents

| Path | What |
|---|---|
| `DECISIONS.md` | every decision of the experiment and its status |
| `features/<feature>/feature-package.md` | the complete specification of a feature: the text blocks added to the project files, word for word the same for greenfield and brownfield |
| `features/<feature>/01_input/01_project/` | the project files with the package applied (generated, never edited by hand) |
| `features/<feature>/change/` | the same feature as a prepared change request (`change.md`, `acceptance-criteria.md`, `api-contract.md`), copied into a run's `04_changes/` and signed with `sign-change.mjs` |
| `features/build-inputs.py` | regenerates the input files from the package and the template, and checks every block is used verbatim |
| `oracle/` | the hidden oracle: regression scenarios for every run, feature scenarios per feature, any number of features per run; `oracle/run.py <run folder>` runs all of it in one command |
| `instructions/normal.md`, `greenfield.md`, `brownfield.md` | how each run type is done, on top of the template's `Run_Guide.md` |

## Fixed ids

Each feature owns its ids in every run type, so features can be combined in any order (D-06):

| Feature | Ids |
|---|---|
| `import` | US-014, AC-014-01..14, BR-20..22, SR-12, E2E-08, DoD-P07 |
| `activity` | US-015, AC-015-01..15, BR-23..24, SR-13, E2E-09, DoD-P08 |
| next feature | continues after these (US-016, BR-25, SR-14, E2E-10, DoD-P09) |

## Naming

Branch `<user>/single-agent/sdd/contacts/run-<n>[-<features>]`, the run number counted per feature combination: normal `…/run-1`, feature runs `…/run-1-import`, `…/run-1-activity`, chained `…/run-1-import-activity`. Run label (in `run-config.md`, used as the folder name): `<user>_single-agent_sdd_contacts_run-<n>[-<features>]`.

## After changing the template

When the template's project files change, regenerate the greenfield inputs and check the change requests still lint:

```bash
python3 features/build-inputs.py import --template ../workflow
python3 features/build-inputs.py activity --template ../workflow
```

(`--ref <git ref>` reads another commit; `--worktree` reads uncommitted files.) A stopped script names the anchor or block that no longer fits; fix the package, never the generated files.
