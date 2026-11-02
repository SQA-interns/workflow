# Normal run (baseline)

> Shared by every side · A normal run is the baseline for every feature and the starting point of brownfield runs

Follow the template's `Run_Guide.md` exactly; it already describes a normal run:

1. Clone `main` only (`git clone --single-branch -b main https://github.com/SQA-interns/workflow.git <run label>`) and create the branch `<user>/single-agent/sdd/contacts/run-<n>`.
2. `run-config.md`: Run label `<user>_single-agent_sdd_contacts_run-<n>`; Run type `normal`; Features `none`; Base run empty; Machine and Plan filled.
3. Copy no feature files. Start with `Read AGENTS.md and start.`
4. After the run: privacy check, statistics commit, then `python3 <this repository>/oracle/run.py <run folder>`, privacy check again, commit `oracle <label>`, push.
5. Note the SHA of the branch's final commit: it is a possible base for brownfield runs.
