# Security requirements

> Owner: Security officer · Read in: phases 2, 6 · Agent: read-only

Adds to `general/security/security-baseline.md` (SB-01 … SB-14); do not repeat those here.

## Verification standard

| Component | Standard | Level | Reason if above the default |
|---|---|---|---|
| backend | OWASP ASVS 5.0 | Level 2 | Authenticated, multi-tenant system holding other people's contact data under its own authorization model; a flaw exposes one tenant's data to another. |
| frontend | OWASP ASVS 5.0 | Level 2 | Same reason; the frontend holds the user's session token. |

Where a requirement below is more specific than ASVS, it applies as well.

## Authentication and authorization

- Authentication is Firebase Authentication only (email and password, Google). The application stores no password and no credential.
- Authorization is the application's own: Workspace membership and Role, stored in PostgreSQL, checked on every Workspace request (BR-02, BR-03, the permission table in `business-rules.md`).
- There are no public endpoints under `/api`; health and readiness endpoints expose no data.

## Personal data

The personal data is that of the Contacts (people who did not sign up themselves) and of the Users.

| Data item | Purpose | Retention | Shown/exported to |
|---|---|---|---|
| Contact Predefined fields (name, email, phone, company, job title, address, country, note) | keep the contact | until purged or the Workspace is deleted (`scope.md` OQ-12) | Members of the Contact's Workspace, Exports |
| Contact Attributes and Tags | describe and categorise the contact | as above | as above |
| Revisions (earlier states of the above) | audit trail and Restore | as above; purge removes them with the Contact | Members of the Workspace |
| User email, display name, Firebase user id | sign-in, membership, Revision author | while the User exists | Members of Workspaces the User belongs to (email and display name only) |
| Pending invitation email | turn an invitation into a membership | until accepted or cancelled, or the Workspace is deleted | Members of the Workspace |

## Project requirements

| ID | Requirement |
|---|---|
| SR-01 | Every `/api` request carries a Firebase ID token that the backend verifies itself: signature against Google's (or, when configured, the emulator's) keys, audience and issuer equal to the configured project, not expired, non-empty subject. The frontend's sign-in state alone is never trusted. |
| SR-02 | The Auth emulator is accepted only when `FIREBASE_AUTH_EMULATOR_HOST` is set by environment configuration, never by default. A production profile refuses to start when the emulator setting is present, when the project id starts with `demo-`, or when the project id is empty. |
| SR-03 | Workspace isolation (BR-02, AR-04): every Workspace endpoint first resolves the caller's membership from the path's Workspace id; the answer for a non-Member is indistinguishable from the answer for a Workspace that does not exist (same status, body and, as far as practical, timing). Ids in request bodies never widen access. |
| SR-04 | A pending invitation is turned into a membership only for a token whose email is verified (`email_verified` claim true) and equal, case-insensitively, to the invited email. |
| SR-05 | Every `/api` endpoint is rate limited per User (per client address before authentication), and request bodies have a size limit. Export and merge requests are limited separately from reads. |
| SR-06 | The Export writes every value as a text cell; no cell is ever a formula, whatever the value starts with (`=`, `+`, `-`, `@`). |
| SR-07 | Revisions record the authenticated User as author; no request field sets an author, a time or a Revision number. |
| SR-08 | Logs and error responses name Workspaces, Contacts and Users only by id; no Contact data, email or token is logged (adds to SB-07). |
| SR-09 | The frontend keeps the Firebase session only where the Firebase JS SDK keeps it, sends the token only to the backend's `/api`, and renders all Contact data as text, never as HTML. |
| SR-10 | The reverse proxy in front of the backend never forwards a client-supplied `Host` header; it sets the upstream host itself. |
| SR-11 | Allowed frontend origins (CORS) come from configuration; production allows only the frontend's own origin. |
| SR-13 | The activity lists only Revisions of Contacts of the path's Workspace, never of another Workspace, also for a User who is Member of several; it shows authors by user id and email only. |

## Overrides

None.
