# CR-000: Excel import

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

- Type: add
- Baseline: filled by sign-change.mjs
- Requested by: <operator> · Approved: pending
- Security impact: a new upload endpoint for Editors parses an untrusted `.xlsx` workbook (SR-12: formulas rejected, no external entities, upload and uncompressed size limits, rate limited like Export and merge); imported personal data is the same Contact data as before (SB-12), isolated per Workspace (BR-02, SR-03).

## Intent

As an Editor, I want to import Contacts from an Excel workbook laid out like the Export, so that I can bring an existing list into a Workspace without typing it again. Excel import in the Export's layout is now in scope; the answer to OQ-06 ("export only") no longer holds for this workbook, and import from every other source stays out of scope.
Out of scope: updating existing Contacts from a workbook, CSV, vCard or any other format, a column-mapping dialog.

## Stories

### US-014 Excel import

As an Editor, I want to import Contacts from an Excel workbook laid out like the Export, so that I can bring an existing list into a Workspace without typing it again.
In scope: upload of one `.xlsx` workbook into a Workspace, validation of every row with the Contact rules, all or nothing, a report of possible duplicates (BR-20, BR-21, BR-22). Out of scope: updating existing Contacts from a workbook, CSV, vCard or any other format, a column-mapping dialog.

## Rules and data

| ID | Change | Rule |
|---|---|---|
| BR-20 | ADDED | An import reads the first sheet of one `.xlsx` workbook. Its first row holds the column headers: a header equal, case-insensitively, to a Predefined field name of the Export or to `tags` fills that field; `id` is ignored; every other header is an Attribute key, written as in the header. Columns may come in any order. Every following row that is not entirely empty is one Contact; an empty cell is an absent value; Tags are the cell's text split at commas, trimmed, empty pieces ignored. |
| BR-21 | ADDED | An import is all or nothing: every row is checked with the same rules as creating a Contact (BR-07 to BR-10), every header with BR-09 and for duplicates (case-insensitively); if any row or header breaks a rule, no Contact and no Tag is created and every error is reported with its sheet row number. A workbook that cannot be read, holds no data row or more than 10,000 data rows, or contains a formula cell is rejected as a whole. |
| BR-22 | ADDED | Each imported row becomes a new Contact with a `CREATE` Revision whose author is the importing User; existing Contacts are never changed. The import reports, per row, the Contacts it matches by BR-15, both existing active Contacts and other rows of the same workbook. |

## Design and quality

| ID | Change | Requirement | Checked by |
|---|---|---|---|
| SR-12 | ADDED | The import treats the workbook as untrusted data: formulas are rejected and never evaluated, XML external entities are never resolved, the upload is limited to 5 MB and the uncompressed workbook to 50 MB (larger: HTTP 413 or 400 for `file`), and import requests are rate limited like Export and merge (SR-05). | acceptance and integration tests |
| DoD-P07 | ADDED | Against the running local stack: an Export of 1,000 seeded Contacts imported into a new Workspace creates 1,000 Contacts with the same values; the same import by a Viewer is refused. | runtime demonstration log, response codes |

## Baseline items changed

none

## Must not change

AC-002-01..06, AC-004-01..05, AC-005-01..09, AC-006-01..06, AC-007-01..07, AC-009-01..08, AC-010-01..07, AC-012-01..07, E2E-01..07, BR-02, BR-07..10, BR-12, BR-15, BR-17, SR-03, SR-05, SR-06, AR-04, AR-08, AR-09.

## Open questions

none
