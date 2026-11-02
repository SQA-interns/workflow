# API contract: CR-000

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

Adds to `project/02_design/api-contract.md` and follows its common rules.

## Endpoints

### `GET /api/workspaces/{workspaceId}/activity` (any Role)

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
