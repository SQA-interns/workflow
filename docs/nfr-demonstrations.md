# Runtime demonstrations (#14)

These are demonstrations against the running Compose stack, not tests. Recorded on 2026-11-02 on the development machine (Docker 29, all four containers local).

## NFR-07: 10,000 Contacts

`python3 scripts/nfr07_scale_demo.py` seeds one Workspace with 10,000 Contacts (two Tags and two Attributes each, a CREATE Revision each) and measures through nginx → backend → PostgreSQL, 25 requests per scenario:

| Scenario | median | p95 | target |
|---|---|---|---|
| list, first page | 13.4 ms | 15.9 ms | ≤ 500 ms |
| list, page 200 sorted by company | 40.0 ms | 41.8 ms | ≤ 500 ms |
| search `kovacic` | 18.3 ms | 21.3 ms | ≤ 500 ms |
| search `sasa novak` | 22.0 ms | 25.9 ms | ≤ 500 ms |
| Tags (all) + country + search | 26.8 ms | 29.6 ms | ≤ 500 ms |
| Attribute + company | 38.9 ms | 45.7 ms | ≤ 500 ms |
| Export of all 10,000 Contacts | 0.98 s (629 KiB) | | ≤ 10 s |

Result: **met**.

## NFR-02: data survives container recreation

`scripts/nfr02_persistence_demo.sh` creates a User (Auth emulator), a Workspace and a Contact, runs `docker compose down` and `docker compose up`, signs in again and reads the Contact and its Revision back. PostgreSQL keeps its data in the `db-data` volume; the Auth emulator exports its accounts to the `auth-data` volume on shutdown and imports them on start.

Result: **met** ("the User signs in again and the Contact (Žabjek) and its Revision are still there").

## NFR-04: health and readiness

`GET /api/health` (liveness) and `GET /api/health/ready` (database check) are used by the backend container's health check; Compose starts the frontend only after the backend is healthy.

## NFR-06: accessibility

axe-core runs inside the end-to-end scenarios on the Workspace list and Contact list (E2E-01), Contact page (E2E-01, E2E-04), history page (E2E-04) and Duplicates page and merge dialog (E2E-05); serious or critical violations fail the scenario. E2E-01 also walks the main flow with the keyboard alone (skip link, new Contact form, history link).
