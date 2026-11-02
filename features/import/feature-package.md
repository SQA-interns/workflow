# Feature package: `import` (Excel import of Contacts)

> Owner: Product owner · Status: proposed 2026-11-02 · Shared by greenfield and brownfield runs, word for word

This file is the complete and only specification of the feature. Both run types use exactly this text:

- **Greenfield:** before the run, every block below is applied to the named file in `01_input/01_project/` (added or replaced exactly as written; `features/build-inputs.py` does it), then the inputs are committed and the run starts as a normal run.
- **Brownfield:** the same requirements, in the change-request format, are `change/` (`change.md`, `acceptance-criteria.md`, `api-contract.md`), copied into a finished run's `04_changes/` and signed.

Fixed ids, the same in both run types and never used by another feature (D-06): `US-014`, `AC-014-nn`, `BR-20` to `BR-22`, `SR-12`, `E2E-08`, `DoD-P07`; the endpoint is added to the fixed API contract (`api-contract.md`, AR-09). Nothing else in the project changes.

---

## 1. `01_requirements/user-stories.md`: add at the end

```markdown
### US-014 Excel import

As an Editor, I want to import Contacts from an Excel workbook laid out like the Export, so that I can bring an existing list into a Workspace without typing it again.
In scope: upload of one `.xlsx` workbook into a Workspace, validation of every row with the Contact rules, all or nothing, a report of possible duplicates (BR-20, BR-21, BR-22). Out of scope: updating existing Contacts from a workbook, CSV, vCard or any other format, a column-mapping dialog.
```

## 2. `01_requirements/business-rules.md`: add three rows to the Rules table

```markdown
| BR-20 | An import reads the first sheet of one `.xlsx` workbook. Its first row holds the column headers: a header equal, case-insensitively, to a Predefined field name of the Export or to `tags` fills that field; `id` is ignored; every other header is an Attribute key, written as in the header. Columns may come in any order. Every following row that is not entirely empty is one Contact; an empty cell is an absent value; Tags are the cell's text split at commas, trimmed, empty pieces ignored. |
| BR-21 | An import is all or nothing: every row is checked with the same rules as creating a Contact (BR-07 to BR-10), every header with BR-09 and for duplicates (case-insensitively); if any row or header breaks a rule, no Contact and no Tag is created and every error is reported with its sheet row number. A workbook that cannot be read, holds no data row or more than 10,000 data rows, or contains a formula cell is rejected as a whole. |
| BR-22 | Each imported row becomes a new Contact with a `CREATE` Revision whose author is the importing User; existing Contacts are never changed. The import reports, per row, the Contacts it matches by BR-15, both existing active Contacts and other rows of the same workbook. |
```

## 3. `01_requirements/scope.md`

In "In scope", add the line after the Export line:

```markdown
- Excel import of Contacts in the Export's layout (US-014)
```

In "Out of scope", replace the line `- Import of Contacts (Excel, CSV, vCard or any other source)` with:

```markdown
- Import of Contacts from any source other than the Excel workbook of US-014 (CSV, vCard, …); updating existing Contacts by import
```

Replace the row `OQ-06` with:

```markdown
| OQ-06 | Is Excel import part of the integration? | Product owner | Yes, as US-014: a workbook in the Export's layout creates new Contacts, all or nothing (BR-20 to BR-22). Other formats stay out of scope. |
```

## 4. `01_requirements/acceptance-criteria.md`

Insert before "Traceability":

```markdown
## US-014 Excel import

*Import workbook*: an `.xlsx` workbook whose first sheet's first row holds headers (BR-20); "row n" is the sheet's row number, so the first data row is row 2.

| ID | Criterion | Refs |
|---|---|---|
| AC-014-01 | Given an import workbook with the Export's headers and 3 valid rows, when an Editor imports it, then it answers 201 with `created` 3 and 3 `contactIds` in row order, and each Contact holds its row's Predefined fields, Tags and Attributes. | BR-20, BR-22 |
| AC-014-02 | Given an Export of Workspace W, when it is imported into another Workspace V, then V holds one new Contact per exported Contact with equal Predefined fields, Tags and Attributes. | BR-20, BR-17 |
| AC-014-03 | Given an import workbook whose headers are `FIRSTNAME`, `Email`, `id`, `tags` and `kompetenca` in this order, when it is imported, then the first two fill first name and email, `id` is ignored, `tags` fills the Tags and `kompetenca` becomes an Attribute. | BR-20 |
| AC-014-04 | Given an import row with empty cells, values with leading and trailing spaces and a Tag cell `a, ,b ,` , when it is imported, then empty cells are absent, values are trimmed and the Contact has exactly the Tags `a` and `b`; an entirely empty row creates nothing. | BR-20, BR-07 |
| AC-014-05 | Given an import workbook whose row 3 has an invalid email, when it is imported, then it is rejected (HTTP 400) with an error for `rows[3].email`, and no Contact and no Tag of the workbook exists afterwards. | BR-21 |
| AC-014-06 | Given an import workbook whose row 4 has no first name, last name or email, when it is imported, then it is rejected (HTTP 400) with an error for `rows[4]`. | BR-21, BR-07 |
| AC-014-07 | Given an import workbook with a header that is not a valid Attribute key, or two headers equal case-insensitively, when it is imported, then it is rejected (HTTP 400) with an error for `headers[<column number>]` of that header (columns counted from 1). | BR-21, BR-09 |
| AC-014-08 | Given an upload that is not an `.xlsx` workbook, a workbook with only a header row, or one with more than 10,000 data rows, when it is imported, then it is rejected (HTTP 400) with an error for `file`. | BR-21 |
| AC-014-09 | Given an import workbook with a formula cell in row 2, when it is imported, then it is rejected (HTTP 400) with an error for row 2 and the formula is never evaluated. | BR-21, SR-12 |
| AC-014-10 | Given an import of 2 rows by an Editor, when it succeeds, then each new Contact has exactly one Revision, number 1, type `CREATE`, with the Editor as author. | BR-22, BR-12 |
| AC-014-11 | Given an existing Contact with email E, when a workbook is imported whose row 2 has E in other letter case and whose rows 3 and 4 share a phone, then it answers 201, row 2 is reported with the existing Contact and `EMAIL`, and rows 3 and 4 are reported with each other's new Contact and `PHONE`. | BR-22, BR-15 |
| AC-014-12 | Given Workspace W, when a Viewer imports a valid workbook, then it is rejected (HTTP 403); when a non-Member does, then it answers 404; in both cases nothing is created. | BR-03, BR-02 |
| AC-014-13 | Given the Contact list page of an Editor, when they choose import and pick a valid workbook, then the page reports the number of created Contacts and the list shows them; with an invalid workbook, it shows each error with its row and imports nothing. A Viewer sees no import control. | BR-21, NFR-05 |
| AC-014-14 | Given an import row with Slovenian characters (č, š, ž, Č, Š, Ž) in names, company and an Attribute value, when it is imported, then the Contact holds the text unchanged. | BR-08, NFR-01 |
```

In the Traceability table, add the row after the US-013 row:

```markdown
| US-014 | AC-014-01 … AC-014-14 |
```

Replace the total:

```markdown
Total: 101 criteria.
```

## 5. `01_requirements/e2e-scenarios.md`: add a row to the table

```markdown
| E2E-08 | Export and import into another Workspace | In a Workspace with 3 Contacts (Tags, Attributes, Slovenian characters), export all of them. Create a second Workspace and import the downloaded workbook from its Contact list: the page reports 3 created Contacts and lists them with the same values and Tags. Import a workbook with one invalid email: the error names its row, and the list is unchanged. | AC-014-02, AC-014-05, AC-014-13, DoD-P07 |
```

## 6. `02_design/security-requirements.md`: add a row to "Project requirements"

```markdown
| SR-12 | The import treats the workbook as untrusted data: formulas are rejected and never evaluated, XML external entities are never resolved, the upload is limited to 5 MB and the uncompressed workbook to 50 MB (larger: HTTP 413 or 400 for `file`), and import requests are rate limited like Export and merge (SR-05). |
```

## 7. `02_design/architecture.md`: Interfaces table, add after the Export row

```markdown
| Import workbook | the Member's spreadsheet program and backend | file (`.xlsx` upload, multipart; layout in `api-contract.md`) |
```

## 8. `02_design/quality-requirements.md`: Additional done criteria

```markdown
| DoD-P07 | Against the running local stack: an Export of 1,000 seeded Contacts imported into a new Workspace creates 1,000 Contacts with the same values; the same import by a Viewer is refused. | runtime demonstration log, response codes |
```

## 9. `02_design/api-contract.md`: add at the end

```markdown
### Import

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
```

---

## Not changed by this feature

`tech-stack.md` (Apache POI and multipart upload are already available), `environments.md`, `pre-approved.md`, `secrets.env.example`, the quality gate, the mutation scope, all general files and `03_statistics/`.
