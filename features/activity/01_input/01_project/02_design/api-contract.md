# API contract

> Owner: Architect · Read in: phases 2, 3, 4, 6 · Agent: read-only

The REST API between the frontend and the backend is fixed by this file (AR-09): paths, methods, field names, status codes and the local test settings below are the same in every run of this project, so that external checks can use them. Everything not stated here (internal design, additional optional response fields, the OpenAPI document written in phase 2) is the agent's choice. The phase 2 contract in `docs/02_contracts/` must describe exactly this API.

## Local stack

| Item | Value |
|---|---|
| Backend base URL | `http://127.0.0.1:8080` (published by `02_output/docker-compose.yml`) |
| Frontend URL | `http://127.0.0.1:3000` (nginx serving the built frontend and forwarding `/api` to the backend) |
| Firebase Auth Emulator | `http://127.0.0.1:9099` |
| Start | `docker compose --env-file ../.env up -d --build --wait`, run in `02_output/` of a clean checkout, builds and starts the whole stack (frontend, backend, PostgreSQL, Auth emulator); no other build step is needed |
| Firebase project | setting `FIREBASE_PROJECT_ID`; locally a `demo-` id (`demo-kontakti` by default), which needs no real Firebase project |
| Auth emulator | setting `FIREBASE_AUTH_EMULATOR_HOST` (`host:port`); when set, the backend accepts tokens issued by the emulator and the frontend signs in against it. `docker-compose.yml` sets it to its own emulator service by default, so a plain `docker compose up` runs against the emulator with no extra setting |
| Rate limit | setting `RATE_LIMIT_PER_MINUTE`: requests per minute per signed-in User (per client address before sign-in) and endpoint; the agent chooses the default |

`docker-compose.yml` passes these settings from the environment to the backend and the frontend, so they can be changed with `docker compose up` without editing a file. `FIREBASE_PROJECT_ID` comes from `.env`.

Tokens for tests: create a user with the emulator's REST API (`POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any` with `email`, `password`, `returnSecureToken: true`) and use the returned `idToken`. Mark an email verified with the emulator's `accounts:update` endpoint (`emailVerified: true`, header `Authorization: Bearer owner`), then sign in again for a fresh token.

## Common rules

- Every endpoint under `/api` requires `Authorization: Bearer <Firebase ID token>`. A missing, malformed, expired or wrongly issued token is answered with HTTP 401 and no data.
- Request and response bodies are JSON (`application/json; charset=utf-8`), except the Export.
- Ids are UUIDs; times are ISO 8601 with offset or `Z`.
- Roles are `OWNER`, `EDITOR`, `VIEWER`. Revision change types are `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `MERGE`, `MERGED_AWAY`. Duplicate match kinds are `EMAIL`, `PHONE`, `NAME`.
- Every error has the body `{"errors": [{"field": "<name or null>", "message": "<text>"}]}`. A rejected request (HTTP 400) has one entry per invalid field; `field` is the request field's name as written in this file (for a nested value a path such as `attributes[2].key` or `tags[0]`; for a query parameter the parameter name).
- `/api/workspaces/{workspaceId}/…`: when the Workspace does not exist or the caller is not a Member, the answer is HTTP 404 with the same body in both cases. A Member whose Role does not allow the action gets HTTP 403. A Contact, Tag, Member or invitation id that does not exist in that Workspace is answered with 404.
- A change that names an outdated `version` is answered with HTTP 409, `field` `version`, and writes nothing (BR-13). A request that breaks BR-04 (last Owner), a duplicate membership or invitation, or a Tag rename onto an existing name is answered with HTTP 409.
- A request over the rate limit is answered with HTTP 429; a body over the size limit with HTTP 413.

## Resources

### Contact (response)

```json
{
  "id": "5b1c…",
  "version": 3,
  "firstName": "Saša",
  "lastName": "Novak",
  "email": "sasa@example.si",
  "phone": "+386 41 123 456",
  "company": "Primer d.o.o.",
  "jobTitle": "Razvijalka",
  "street": "Slovenska cesta 1",
  "postalCode": "1000",
  "city": "Ljubljana",
  "country": "SI",
  "note": null,
  "attributes": [{"key": "kompetenca", "value": "spletnoProgramiranje"}],
  "tags": ["neObvescaj", "udelezenec2025"],
  "deleted": false,
  "mergedInto": null,
  "createdAt": "2026-11-02T10:00:00Z",
  "updatedAt": "2026-11-02T10:05:00Z"
}
```

An absent Predefined field is `null`. `attributes` keep the order they were written; `tags` are the Tags' current spellings, sorted case-insensitively.

### Contact (request body for create and update)

The same Predefined fields, `attributes` and `tags` (each optional; absent means empty), and for update `version`. An update replaces the whole Contact state: a field, Attribute or Tag left out is removed.

### Contact summary (in lists of duplicates)

`{"id", "firstName", "lastName", "email", "phone", "company"}`

## Endpoints

### `GET /api/me`

Response 200: `{"id": "…", "email": "…", "emailVerified": true, "displayName": "…"}`. Creates or updates the User record (BR-01) and turns matching pending invitations into memberships (BR-05). Every other endpoint does the same on its first call.

### Workspaces

| Method and path | Role | Request | Responses |
|---|---|---|---|
| `GET /api/workspaces` | signed in | | 200 `[{"id", "name", "role"}]`, only Workspaces where the caller is a Member, sorted by name |
| `POST /api/workspaces` | signed in | `{"name"}` | 201 `{"id", "name", "role": "OWNER"}`; 400 |
| `GET /api/workspaces/{workspaceId}` | any | | 200 `{"id", "name", "role"}` |
| `PATCH /api/workspaces/{workspaceId}` | OWNER | `{"name"}` | 200 `{"id", "name", "role"}`; 400 |
| `DELETE /api/workspaces/{workspaceId}?confirmName=<name>` | OWNER | | 204; 400 (`field` `confirmName`) when it differs from the name |

### Members and invitations

| Method and path | Role | Request | Responses |
|---|---|---|---|
| `GET /api/workspaces/{workspaceId}/members` | any | | 200 `{"members": [{"userId", "email", "displayName", "role"}], "invitations": [{"id", "email", "role", "invitedBy", "createdAt"}]}` |
| `POST /api/workspaces/{workspaceId}/members` | OWNER | `{"email", "role"}` | 201 `{"status": "ACTIVE", "userId", "email", "role"}` or 201 `{"status": "PENDING", "invitationId", "email", "role"}`; 400; 409 already a Member or invited |
| `PATCH /api/workspaces/{workspaceId}/members/{userId}` | OWNER | `{"role"}` | 200 member; 400; 409 (BR-04) |
| `DELETE /api/workspaces/{workspaceId}/members/{userId}` | OWNER, or any Member for their own `userId` (leave) | | 204; 409 (BR-04) |
| `DELETE /api/workspaces/{workspaceId}/invitations/{invitationId}` | OWNER | | 204 |

### Contacts

| Method and path | Role | Request | Responses |
|---|---|---|---|
| `GET /api/workspaces/{workspaceId}/contacts` | any | query, below | 200 `{"items": [Contact], "page", "size", "totalItems"}` |
| `POST /api/workspaces/{workspaceId}/contacts` | EDITOR | Contact request | 201 `{"contact": Contact, "possibleDuplicates": [{"contact": summary, "matchedOn": ["EMAIL"]}]}`; 400 |
| `GET /api/workspaces/{workspaceId}/contacts/{contactId}` | any | | 200 Contact (also for a Deleted contact) |
| `PUT /api/workspaces/{workspaceId}/contacts/{contactId}` | EDITOR | Contact request with `version` | 200 as for create; 400; 409; 409 for a Deleted contact |
| `DELETE /api/workspaces/{workspaceId}/contacts/{contactId}?version=<n>` | EDITOR | | 204; 409 |
| `POST /api/workspaces/{workspaceId}/contacts/{contactId}/restore` | EDITOR | `{"version"}` | 200 Contact; 409 when not a Deleted contact or stale |
| `POST /api/workspaces/{workspaceId}/contacts/{contactId}/purge` | OWNER | | 204; 409 when not a Deleted contact |
| `GET /api/workspaces/{workspaceId}/contacts/{contactId}/revisions` | any | | 200 `[{"number", "changeType", "author": {"userId", "email"}, "createdAt", "state": {Predefined fields, "attributes", "tags", "deleted"}}]`, newest first |
| `POST /api/workspaces/{workspaceId}/contacts/{contactId}/revisions/{number}/restore` | EDITOR | `{"version"}` | 200 Contact; 404 unknown number; 409 for a Deleted contact or stale |

List query parameters (all optional, combined with AND):

| Parameter | Meaning |
|---|---|
| `q` | search text (BR-11) over first name, last name, email, phone, company and city |
| `tag` | repeatable; a Tag name, compared case-insensitively |
| `tagMode` | `all` (default: the Contact has every given Tag) or `any` |
| `country` | ISO code, case-insensitive |
| `company` | exact, case-insensitive |
| `attr` | repeatable; `key=value` (exact, case-insensitive key and value) or `key` (the Attribute is present) |
| `deleted` | `false` (default) or `true` (only Deleted contacts) |
| `sort` | `lastName` (default), `firstName`, `company`, `updatedAt`; ties broken by `lastName`, `firstName`, `id` |
| `direction` | `asc` (default) or `desc` |
| `page` | from 0 (default 0) |
| `size` | 1 to 100 (default 25) |

An invalid parameter value is answered with 400 and that parameter as `field`.

### Tags

| Method and path | Role | Request | Responses |
|---|---|---|---|
| `GET /api/workspaces/{workspaceId}/tags` | any | | 200 `[{"id", "name", "contactCount"}]`, sorted case-insensitively; `contactCount` counts active Contacts |
| `PATCH /api/workspaces/{workspaceId}/tags/{tagId}` | EDITOR | `{"name"}` | 200 tag; 400; 409 name exists |
| `DELETE /api/workspaces/{workspaceId}/tags/{tagId}` | EDITOR | | 204 |

### Duplicates and Merge

| Method and path | Role | Request | Responses |
|---|---|---|---|
| `GET /api/workspaces/{workspaceId}/duplicates` | any | | 200 `{"sets": [{"contacts": [summary], "matchedOn": ["EMAIL", "NAME"]}]}`; `matchedOn` lists every kind that connects Contacts of the set |
| `POST /api/workspaces/{workspaceId}/merge` | EDITOR | below | 200 Contact (the Survivor); 400; 409 any stale version |

```json
{
  "survivorId": "…",
  "contacts": [{"id": "…", "version": 2}, {"id": "…", "version": 1}],
  "fieldSources": {"email": "<contact id>", "phone": "<contact id>"},
  "attributeSources": {"kompetenca": "<contact id>"}
}
```

`contacts` lists 2 to 10 distinct active Contacts and includes the Survivor; `fieldSources` keys are Predefined field names, `attributeSources` keys are Attribute keys (case-insensitive); every id given as a source is one of `contacts`. Defaults: BR-16.

### Export

`POST /api/workspaces/{workspaceId}/export` (any Role), with exactly one of:

```json
{"contactIds": ["…", "…"]}
```

```json
{"filter": {"q": "…", "tags": ["…"], "tagMode": "all", "country": "SI", "company": "…", "attrs": ["kompetenca=spletnoProgramiranje"], "sort": "lastName", "direction": "asc"}}
```

Response 200: an Excel workbook (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) with `Content-Disposition: attachment; filename="kontakti-<workspace name>-<yyyy-mm-dd>.xlsx"` (the name reduced to letters, digits and `-`). The first sheet's first row holds these column headers, in this order, followed by one row per Contact:

`id`, `firstName`, `lastName`, `email`, `phone`, `company`, `jobTitle`, `street`, `postalCode`, `city`, `country`, `note`, `tags`, then one column per Attribute key present in the exported Contacts, headed by the key in lower case, sorted alphabetically

`tags` are the Tag names separated by `, `; an absent value is an empty cell; every cell is a text cell. Rows follow the filter's sort, or for `contactIds` the default sort. Responses 400 when both or neither are given, when a `contactIds` entry is not an active Contact of the Workspace (`field` `contactIds`), or when more than 10,000 Contacts would be exported (`field` `contactIds` or `filter`).

### Activity

`GET /api/workspaces/{workspaceId}/activity` (any Role).

Query parameters, all optional, combined with AND: `author` (a user id), `changeType` (repeatable; any of the given types), `contactId`, `page` (from 0, default 0), `size` (1 to 100, default 25).

Response 200:

    {
      "items": [
        {"contactId": "…", "revisionNumber": 2, "changeType": "UPDATE",
         "author": {"userId": "…", "email": "…"}, "createdAt": "2026-11-02T10:05:00Z",
         "contact": {"firstName": "Maja", "lastName": "Novak", "email": "maja@example.si"}}
      ],
      "page": 0,
      "size": 25,
      "totalItems": 3
    }

`items` are newest first (BR-23); `contact` holds the values of that Revision. Response 400 with the invalid parameter as `field`.
