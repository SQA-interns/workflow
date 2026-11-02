# API contract: CR-000

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

Adds to `project/02_design/api-contract.md` and follows its common rules.

## Endpoints

### `POST /api/workspaces/{workspaceId}/import` (EDITOR)

`POST /api/workspaces/{workspaceId}/import` (EDITOR), `multipart/form-data` with one part `file` holding the `.xlsx` workbook (at most 5 MB).

Headers and rows: BR-20 (the Export's column names, case-insensitive; `id` ignored; any other header is an Attribute key).

Response 201:

    {
      "created": 3,
      "contactIds": ["…", "…", "…"],
      "possibleDuplicates": [
        {"row": 2, "matches": [{"contactId": "…", "matchedOn": ["EMAIL"]}]}
      ]
    }

`contactIds` are in row order; `possibleDuplicates` lists only rows with at least one match, and a match with another row of the workbook names that row's new Contact. Response 400 when anything is invalid, with one error per problem: `field` is `file` (unreadable, no data row, more than 10,000 data rows), `headers[<column number>]` (columns counted from 1), `rows[<row number>]` for a rule on the whole row, or `rows[<row number>].<name>` for one cell, where `<name>` is the Predefined field name, `tags`, or the Attribute key as written in the header. Nothing is created on any error.
