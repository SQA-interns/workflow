# API contract

All endpoints live under `/api`, take and return JSON (except the Export workbook), and need `Authorization: Bearer <Firebase ID token>` (except `/api/health*`).

## Ports (Docker Compose)

| Service | Host port | Notes |
|---|---|---|
| frontend (nginx) | 8080 | serves the UI, forwards `/api` to the backend |
| backend | 8081 | Spring Boot; also reachable directly for API tests |
| auth (Firebase Auth Emulator) | 9099 | used by default; project id `demo-contacts` |
| db (PostgreSQL 16) | not published | volume `db-data` |

## Errors

Every error body is a list of field errors:

```json
{ "errors": [ { "field": "email", "message": "must be a valid email" } ] }
```

`field` is `null` for errors that belong to no field. Status codes:

| Status | Meaning |
|---|---|
| 400 | validation error; `field` names the offending field (`name`, `email`, `attributes[2].key`, `tags[0]`, ...) |
| 401 | missing, malformed, expired or foreign token |
| 403 | the caller's Role does not allow the action |
| 404 | not found, **or the caller is not a Member** (identical body: `{"errors":[{"field":null,"message":"not found"}]}`) |
| 409 | outdated `version`, duplicate Member, last Owner, Tag name taken, purge of an active Contact, Restore of a stale Revision |
| 413 | request body larger than 1 MB |
| 429 | rate limit (per User, default 300 requests per minute) |

## User

`GET /api/me` → 200 `{ id, email, emailVerified, displayName }`. Creates the User on first call, updates email, verified flag and display name from the token on every call, and activates pending invitations for a verified email.

## Workspaces

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/workspaces` | any User | | 200 `[{ id, name, role }]` sorted by name |
| `POST /api/workspaces` | any User | `{ name }` (1–100 chars after trimming) | 201 `{ id, name, role: "OWNER" }` |
| `GET /api/workspaces/{wid}` | Member | | 200 `{ id, name, role }` |
| `PATCH /api/workspaces/{wid}` | Owner | `{ name }` | 200 `{ id, name, role }` |
| `DELETE /api/workspaces/{wid}` | Owner | `{ confirmName }` (must equal the name exactly, else 400 `confirmName`) | 204 |

Roles: `OWNER`, `EDITOR`, `VIEWER`.

## Members and invitations

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/workspaces/{wid}/members` | Member | | 200 `{ members: [{ userId, email, displayName, role }], invitations: [{ id, email, role, createdAt }] }` |
| `POST /api/workspaces/{wid}/members` | Owner | `{ email, role }` | 201 `{ status: "MEMBER", member: {...} }` for a verified existing User, otherwise 201 `{ status: "INVITED", invitation: {...} }`; 409 if already a Member or invited |
| `PATCH /api/workspaces/{wid}/members/{userId}` | Owner | `{ role }` | 200 member; 409 when it would leave no Owner |
| `DELETE /api/workspaces/{wid}/members/{userId}` | Owner, or the Member themself (leave) | | 204; 409 when it would leave no Owner |
| `DELETE /api/workspaces/{wid}/invitations/{id}` | Owner | | 204 |

## Contacts

Contact body:

```json
{
  "id": "uuid", "version": 3, "deleted": false, "mergedInto": null,
  "firstName": "Saša", "lastName": "Novak", "email": "sasa@example.si", "phone": "+386 41 123 456",
  "company": "Podjetje d.o.o.", "jobTitle": "Vodja", "street": "Slovenska 1", "postalCode": "1000",
  "city": "Ljubljana", "country": "SI", "note": "...",
  "attributes": [ { "key": "kompetenca", "value": "spletnoProgramiranje" } ],
  "tags": [ "udelezenec2025" ],
  "createdAt": "...", "updatedAt": "..."
}
```

Field rules: values are trimmed, a blank value becomes `null`. At least one of `firstName`, `lastName`, `email` (400, field `firstName`). Maximum lengths: `firstName`, `lastName`, `city` 100; `email` 254 (must be a valid address); `phone` 50; `company`, `jobTitle`, `street` 200; `postalCode` 20; `note` 2000. `country` is an ISO 3166-1 alpha-2 code, stored in upper case.

Attributes: at most 100; `key` matches `^[A-Za-z][A-Za-z0-9_.-]{0,49}$`, unique on the Contact ignoring case, not equal (ignoring case) to a Predefined field name, `id` or `tags`; `value` 1–500 characters after trimming. Order is kept. Errors name `attributes[i].key` / `attributes[i].value`.

Tags: at most 50 per Contact; each 1–50 characters with no whitespace; no repeats on one Contact ignoring case (errors name `tags[i]`). A new Tag is created on first use; an existing one is reused regardless of case and keeps its first spelling.

| Method and path | Role | Body / query | Response |
|---|---|---|---|
| `GET /api/workspaces/{wid}/contacts` | Member | query below | 200 `{ items: [Contact], total, page, size }` |
| `POST /api/workspaces/{wid}/contacts` | Editor | Contact fields, `attributes`, `tags` | 201 Contact + `possibleDuplicates: [{ id, firstName, lastName, email, phone, matchKinds }]` |
| `GET /api/workspaces/{wid}/contacts/{cid}` | Member | | 200 Contact (also a Deleted contact) |
| `PUT /api/workspaces/{wid}/contacts/{cid}` | Editor | `version` + all fields | 200 Contact + `possibleDuplicates`; 409 on outdated `version` |
| `DELETE /api/workspaces/{wid}/contacts/{cid}?version=n` | Editor | (`version` optional) | 204, writes a `DELETE` Revision |
| `POST /api/workspaces/{wid}/contacts/{cid}/restore` | Editor | | 200 Contact; restores a Deleted contact with its last state (`RESTORE` Revision); 409 if not deleted |
| `POST /api/workspaces/{wid}/contacts/{cid}/purge` | Owner | | 204; permanently removes a Deleted contact and its Revisions; 409 for an active Contact |
| `GET /api/workspaces/{wid}/contacts/{cid}/revisions` | Member | | 200 `[Revision]` newest first |
| `POST /api/workspaces/{wid}/contacts/{cid}/revisions/{n}/restore` | Editor | `{ version }` | 200 Contact; writes a `RESTORE` Revision equal to Revision n; 409 on outdated version or for a Deleted contact |

List query: `q` (search text, case and diacritic insensitive, over first name, last name, full name, email, phone, company, city), `tag` (repeatable), `tagMode=all|any` (default `all`), `attr` (repeatable, `key=value` matches value case-insensitively, `key` alone means presence), `country`, `company` (case-insensitive equality), `deleted=true` (Deleted contacts only; default active only), `sort=lastName|firstName|company|updatedAt` (default `lastName`), `dir=asc|desc` (default `asc`, `desc` for `updatedAt`), `page` (from 0), `size` (1–100, default 20; above 100 → 400 `size`).

Revision: `{ number, type, author: { id, email, displayName }, createdAt, state: { firstName, ..., note, attributes, tags, deleted, mergedInto } }`. Types: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `MERGE`, `MERGED_AWAY`. No endpoint changes or deletes a Revision (only purge and Workspace deletion remove them with their Contact).

## Tags

| Method and path | Role | Body | Response |
|---|---|---|---|
| `GET /api/workspaces/{wid}/tags` | Member | | 200 `[{ name, count }]` sorted by name; `count` = active Contacts |
| `PATCH /api/workspaces/{wid}/tags/{name}` | Editor | `{ name }` | 200 `{ name, count }`; `UPDATE` Revision on every affected Contact; 409 if the new name exists (any case, other Tag) |
| `DELETE /api/workspaces/{wid}/tags/{name}` | Editor | | 204; `UPDATE` Revision on every affected Contact |

`{name}` is matched ignoring case.

## Duplicate sets

`GET /api/workspaces/{wid}/duplicate-sets` (Member) → 200 `[{ contacts: [Contact], matches: [{ contactIds: [a, b], kind: "EMAIL" | "PHONE" | "NAME", value }] }]`.

Normalisation: email lower case; phone `00`→`+`, then digits only, at least 6 digits; full name = first + last name, lower case, diacritics removed, whitespace collapsed (both names needed). Active Contacts only, grouped transitively.

## Merge

`POST /api/workspaces/{wid}/merge` (Editor)

```json
{
  "survivorId": "uuid",
  "contacts": [ { "id": "uuid", "version": 2 }, { "id": "uuid", "version": 5 } ],
  "fieldSources": { "email": "uuid-of-source" },
  "attributeSources": { "kompetenca": "uuid-of-source" }
}
```

2–10 distinct active Contacts; the Survivor and every source must be among them (400 otherwise). For a field without a chosen source the Survivor's value is kept, or the first non-empty value in list order when the Survivor has none. Attributes are combined by key (ignoring case); the Survivor's value wins unless `attributeSources` names another Contact. Tags are combined. The others become Deleted contacts with `mergedInto` = Survivor and a `MERGED_AWAY` Revision; the Survivor gets a `MERGE` Revision. Any outdated version → 409 and nothing changes. Response 200: the Survivor.

## Export

`POST /api/workspaces/{wid}/export` (Member) with exactly one of:

- `{ "contactIds": ["uuid", ...] }`: those Contacts, in list default order (last name, first name); a Deleted, foreign or unknown id → 400 `contactIds`;
- `{ "filter": { q, tag, tagMode, attr, country, company, sort, dir } }`: every active Contact matching, in the filter's order.

Both or neither → 400. More than 10,000 Contacts → 400. Response 200 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="<workspace-name>-<yyyy-MM-dd>.xlsx"` (name reduced to letters, digits, `-` and `_`).

Columns, in order: `Ime`, `Priimek`, `E-pošta`, `Telefon`, `Podjetje`, `Delovno mesto`, `Ulica`, `Poštna številka`, `Kraj`, `Država`, `Opomba`, `Oznake` (Tags joined by `, `), then one column per Attribute key (lower case, sorted). Every cell is a text cell; values are never formulas.

## Health

`GET /api/health` (liveness) and `GET /api/health/ready` (readiness, checks the database), no token needed.
