# Quality requirements

> Owner: QA lead · Read in: phases 2, 6, 7 · Agent: read-only

Adds to `general/quality/` (definition of done, test strategy, severity scale); do not repeat those here.

## Non-functional requirements

| ID | Category (performance, availability, accessibility, localisation, usability, …) | Requirement | How it is checked |
|---|---|---|---|
| NFR-01 | Localisation | Text with Slovenian characters (č, š, ž, Č, Š, Ž, ć, đ) survives the form, the API, the database, search and the Excel Export unchanged; search ignores diacritics. The user interface is in Slovenian. | an end-to-end test with such input (E2E-07) |
| NFR-02 | Reliability | Workspaces, Contacts and Revisions survive recreation of every container. | runtime demonstration: `docker compose down` then `up`, data still present |
| NFR-03 | Usability | The frontend validates fields before submission and shows the backend's field errors next to the fields; the entered values remain after an error. | component tests |
| NFR-04 | Availability | The backend reports health and readiness, and the containers use them in health checks. | runtime demonstration |
| NFR-05 | Usability | Simplicity is the product's advantage: from the Contact list a Member reaches search, filters, selection and Export without leaving the page; creating a Contact needs one form; each Duplicate warning links to the matching Contact; controls a Member's Role does not allow are not shown. | the end-to-end tests (E2E-01, E2E-02, E2E-05, E2E-06) |
| NFR-06 | Accessibility | The Workspace list, Contact list, Contact page, history page and Duplicates page have no `serious` or `critical` axe-core violations (WCAG 2.2 A and AA rules) and can be used with the keyboard alone. | `@axe-core/playwright` inside the end-to-end tests |
| NFR-07 | Performance | With 10,000 Contacts in one Workspace (each with 3 Attributes and 2 Tags), list, search and filter requests answer within 500 ms at the 95th percentile, and an Export of all of them completes within 10 s, on the local stack. | runtime demonstration with seeded data, at least 100 requests per measured query |

## Thresholds

These thresholds are the **quality gate** of the project: the same in every run, per component (backend, frontend), over the scope and with the tests defined in `general/quality/measurement-scope.md`. The agent works until each component meets them, then stops adding tests for that component (rules and stop rule: "Quality gate" in `measurement-scope.md`). The rows below are read by `tools/build-report.mjs`; keep the format `>= <number> %`.

| Measure | Threshold |
|---|---|
| Line coverage (all levels together) | >= 95 % |
| Mutation score (adjusted) | >= 90 % |
| Branch coverage | record only |

## Mutation scope

The paths or packages whose code is mutated, the same in every run of this project (default: all production code of the component). Selection rule: validation, security, persistence and business-rule code. Rules: `general/quality/measurement-scope.md`.

| Component | Paths or packages | Exclusions and reason |
|---|---|---|
| backend | `si.kontakti.**` (all production code under the root package, including authentication, authorization, isolation, validation, persistence, Revision, duplicate, merge and export code) | The `@SpringBootApplication` entry-point class (no logic); generated code. Nothing else may be excluded. |
| frontend | `src/**/*.{ts,tsx,js,jsx}` (all production source of the frontend) | Test files, type-declaration files (`*.d.ts`), the bootstrap file that only mounts the app, generated code. Nothing else may be excluded. |

The scope is all production code of both components, so mutation scores are on the same basis in every run. It is the root package and the source folder, not a list of sub-packages, because the agent chooses the sub-packages in phase 2. Each component's full automated suite runs against it (`measurement-scope.md`, "Mutation score").

## Additional done criteria

| ID | Criterion | Evidence |
|---|---|---|
| DoD-P01 | Against the running local stack: a User signs up, creates a Workspace and a Contact with Attributes and Tags, and finds it by search. | runtime demonstration log |
| DoD-P02 | Isolation holds at runtime: a second User gets 404 for every endpoint of the first User's Workspace (the full endpoint list of `api-contract.md`), and a Viewer gets 403 for every change. | response codes per endpoint |
| DoD-P03 | A Member downloads a valid Excel workbook that opens and holds the expected rows and columns. | response code, opened workbook |
| DoD-P04 | Every Revision in the database belongs to a Contact of the same Workspace, and every Contact's version equals its highest Revision number. | database query |
| DoD-P05 | The production token-verification path is tested against tokens signed by a test key with wrong audience, wrong issuer, expired time and a bad signature, each refused. | test report |
| DoD-P06 | The production profile refuses to start with the emulator setting present, with a `demo-` project id and with an empty project id (SR-02). | startup logs |
| DoD-P08 | Against the running local stack: after a create, an update, a delete and a Merge, the activity lists the matching entries newest first with their authors; a non-Member gets 404. | runtime demonstration log |

## Overrides

None.
