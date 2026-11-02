# Greenfield run

> The feature is part of the inputs from the start; everything else is a normal run

Follow the template's `Run_Guide.md` exactly, with these differences:

1. **Have this repository in its own folder** (once), next to the run folders, never inside one, and `git pull` it before every run.
2. **Clone `main` of the template only** into the run folder and create the branch `<user>/single-agent/sdd/contacts/run-<n>-<feature>`:
   ```bash
   git clone --single-branch -b main https://github.com/SQA-interns/workflow.git <run label>
   cd <run label>
   git switch -c <user>/single-agent/sdd/contacts/run-<n>-<feature>
   ```
3. **Copy the feature's input files** over the run's inputs (merge, overwrite):
   - Git Bash or Linux: `cp -r ../contacts-feature-testing-experiment/features/<feature>/01_input/. ./01_input/`
   - PowerShell: `Copy-Item -Recurse -Force ..\contacts-feature-testing-experiment\features\<feature>\01_input\* .\01_input\`

   Check: `git status` lists only the 9 files under `01_input/01_project/` (`01_requirements/` 5, `02_design/` 4), and `git diff` shows exactly the blocks of `feature-package.md`. Nothing else is changed by hand.
4. **`run-config.md`**: Run label `<user>_single-agent_sdd_contacts_run-<n>-<feature>`; Run type `greenfield`; Features `<feature>`; Base run empty; Machine and Plan filled.
5. Commit (`inputs <feature>`, then `run setup <label>`, or both in one), push the branch, and start with `Read AGENTS.md and start.` Answer questions with the run guide's standard answers; never add information about the feature beyond the package.
6. **After the run**: as a normal run; `run.py` reads the feature from `run-config.md` and runs its scenarios too.

One feature per greenfield run. What makes it comparable: its inputs differ from a normal run only by the generated feature files, which state the same requirements, with the same ids, as the brownfield change request (D-06).
