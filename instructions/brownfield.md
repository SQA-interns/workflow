# Brownfield run

> A feature is added to a finished run as a prepared change request, in a new session; runs can be chained

The procedure is section 5, "Prepared change request", of the template's `Run_Guide.md`. This file adds what is specific to the experiment.

1. **Base run.** A finished normal run (or a finished feature run, for chaining) whose statistics and oracle results are committed and pushed. Note its branch and **final commit SHA**. The base must be on template 1.9-ft of this project, so its API follows the fixed contract.
2. **New folder and branch** from the base, named after the new label (`…/run-<n>-<features>`, the base's features plus the new one, for example `run-1-import`, then `run-1-import-activity`):
   ```bash
   git clone --single-branch -b <base branch> https://github.com/SQA-interns/workflow.git <new run label>
   cd <new run label>
   git switch -c <user>/single-agent/sdd/contacts/run-<n>-<features>
   ```
   Then `.env` excluded and created as in the run guide's steps 1.3 and 1.6.
3. **`run-config.md`**: the new Run label; Run type `brownfield`; Features: every feature the system has **after** this run (`import`, or `import, activity` when chaining); Base run `<base run label> @ <base commit>`; Machine and Plan filled. Commit `run setup <label>`.
4. **Copy the change request** into the next free CR folder (the first is `CR-001`; a chained run continues the base's numbering):
   - Git Bash or Linux: `mkdir -p 04_changes/CR-<nnn>_<feature> && cp ../contacts-feature-testing-experiment/features/<feature>/change/* 04_changes/CR-<nnn>_<feature>/`
   - then replace `CR-000` by `CR-<nnn>` in the three files (the title line of each).
5. **Sign it**: `node 01_input/00_general/skills/change-interview/sign-change.mjs 04_changes/CR-<nnn>_<feature>`. It fills Baseline and Approved, writes `input.sha256`, lints and commits. The lint warns that the feature's ids skip numbers (D-06): expected. An error: fix the copy (never the package here, unless the package is wrong for everyone), then sign again.
6. **New session** in the folder (never continue or fork the base run's session): `Read AGENTS.md and implement CR-<nnn>`. Answer questions with the run guide's standard answers.
7. **After the run**: as a normal run; `run.py` runs the regression and every feature listed in Features, and the report shows the new feature and the earlier ones separately.
