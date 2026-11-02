# Contact management

A simple multi-tenant contact manager: Workspaces with Members and Roles, Contacts with Predefined fields, Attributes and Tags, full Revision history with Restore, Duplicate sets and Merge, and Excel Export. The UI is Slovenian.

- Spec: GitHub issue #1 and its sub-issues #2–#14.
- API contract: [`docs/api-contract.md`](docs/api-contract.md)
- Vocabulary: [`GLOSSARY.md`](GLOSSARY.md); tenancy decision: [`docs/adr/0001-shared-schema-workspaces.md`](docs/adr/0001-shared-schema-workspaces.md)

## Run

```sh
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080 | the application (nginx, forwards `/api`) |
| http://localhost:8081/api/health/ready | backend readiness |
| http://localhost:9099 | Firebase Auth Emulator (default sign-in) |

Data lives in the `db-data` and `auth-data` volumes and survives `docker compose down` / `up` (`down -v` removes it).

### Production settings

The backend refuses to start with the `prod` profile if the Auth emulator is configured, or the Firebase project id is empty or starts with `demo-`. For production set `SPRING_PROFILES_ACTIVE=prod`, `FIREBASE_AUTH_EMULATOR=false`, `FIREBASE_PROJECT_ID=<project>` on the backend, and `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_URL=` (empty), `CSP_CONNECT_SRC=` and `SERVER_NAME=<host>` on the frontend. `CORS_ALLOWED_ORIGINS` is empty by default (same origin through nginx).

## Tests

| Seam | Command | Needs |
|---|---|---|
| REST API acceptance tests (Testcontainers PostgreSQL), architecture rule | `cd backend && ./mvnw test` | Docker |
| Frontend component tests (API client faked) | `cd frontend && npm ci && npm test` | Node 24 |
| End-to-end E2E-01 … E2E-07 with axe-core | `docker compose up -d --wait && cd frontend && npx playwright test` | running stack |
| Type check | `cd frontend && npm run typecheck` | |

Runtime demonstrations (not tests): `python3 scripts/nfr07_scale_demo.py` (10,000 Contacts) and `scripts/nfr02_persistence_demo.sh`; results in [`docs/nfr-demonstrations.md`](docs/nfr-demonstrations.md).
