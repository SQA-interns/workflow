# Architecture

> Owner: Architect · Read in: phases 0, 2, 4, 6, 7 · Agent: read-only

## Components

Each component gets its own folder and README in `02_output/`. Versions come only from `tech-stack.md`; reference its ids, never repeat a version here.

```yaml
components:
  - name: backend
    type: api
    folder: 02_output/backend
    platform: java
    build: maven-wrapper
    bootstrap: Maven wrapper plus a hand-written pom.xml whose parent is org.springframework.boot:spring-boot-starter-parent; artifact contacts-backend; root package si.kontakti
    commands:          # ES-05; filled in phase 0 if left empty
      build:
      test:
      check:
      run:
    depends_on: []
    deploys_as: container image (eclipse-temurin base, non-root)
  - name: frontend
    type: web-app
    folder: 02_output/frontend
    platform: node
    build: vite
    bootstrap: hand-written package.json (name contacts-frontend) with the exact tech-stack.md versions and a committed package-lock.json (no project generator)
    commands:
      build:
      test:
      check:
      run:
    depends_on: [backend]
    deploys_as: container image (static files served by nginx, which also forwards /api to the backend)
```

The local stack (both components, PostgreSQL, Firebase Auth Emulator) is started with `02_output/docker-compose.yml`. The emulator image is built from `02_output/auth-emulator/Dockerfile` (the pinned `node` image plus the pinned `firebase-tools`, running only the Auth emulator); it is local and test infrastructure, not a component, and has no quality gate.

## Constraints

Checkable rules the code must respect (layering, allowed dependencies, patterns). Checked automatically in phase 6 where the stack allows (DoD-04).

| ID | Constraint |
|---|---|
| AR-01 | The frontend talks to the backend only through the REST API under `/api`. |
| AR-02 | The backend's internal architecture is not prescribed: the agent declares and justifies it in `docs/02_specification.md` and then writes ArchUnit rules that check exactly that declaration. |
| AR-03 | No package cycles in the backend (ArchUnit slice check). |
| AR-04 | Workspace isolation lives in one place: Workspace-owned data (Contacts, Revisions, Tags, memberships, invitations) is read and written only through a Workspace-scoped access layer that receives the Workspace id and the caller's verified membership; no other code uses the repositories or queries of those entities (ArchUnit). One shared schema with the Workspace id on every Workspace-owned row; no row-level security and no schema per Workspace (decision ADR-0001 of this repository, summarised in `scope.md` OQ-03). |
| AR-05 | Firebase is used only by one authentication adapter that verifies the token and yields the User; no other backend code depends on Firebase types (ArchUnit). Roles and memberships come only from the application's database (BR-03). |
| AR-06 | The database schema changes only through Flyway migrations (ES-08). |
| AR-07 | The frontend contains no secret; its Firebase web configuration (API key, auth domain, project id, emulator address) comes from configuration. |
| AR-08 | A change to a Contact, its Revision and the version check (BR-12, BR-13) happen in one database transaction; a Merge, a Tag rename and a Tag deletion change all affected Contacts in one transaction, or none. |
| AR-09 | The REST API under `/api` follows `api-contract.md` exactly: paths, methods, field names, status codes and the local test settings. |
| AR-10 | Search, filtering, sorting and pagination run in the database, not in application memory (NFR-07). |

## Interfaces

Every interface between components or with external systems is defined as a contract in `docs/02_contracts/` in phase 2. The REST API is fixed by `api-contract.md` (AR-09); its phase 2 contract describes exactly that API.

| Interface | Between | Style (e.g. REST, gRPC, events, file, UI) |
|---|---|---|
| Contact management UI (Slovenian) | Member and frontend | UI |
| Sign-in | frontend and Firebase Authentication (emulator locally) | Firebase JS SDK |
| Workspaces, members, contacts, revisions, tags, duplicates, merge, export | frontend and backend | REST (OpenAPI) |
| Token verification | backend and Firebase Authentication (emulator locally) | Firebase Admin SDK (public keys over HTTPS) |
| Storage | backend and PostgreSQL | SQL (JPA) |
| Export workbook | backend and the Member's spreadsheet program | file (`.xlsx`, column layout in `api-contract.md`) |
| Activity feed | frontend and backend | REST (OpenAPI), part of the API above |
