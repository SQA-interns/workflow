# Acceptance criteria: CR-000

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

Same rules as the baseline list: one observable behaviour per row (Given / When / Then), each citing its story and rules. Terms the baseline defines ("rejected", "valid Contact", "User A", "Workspace W") keep their meaning here. The agent does not derive, add, merge or reword criteria.

## US-014 Excel import

*Import workbook*: an `.xlsx` workbook whose first sheet's first row holds headers (BR-20); "row n" is the sheet's row number, so the first data row is row 2.

| ID | Change | Criterion | Refs |
|---|---|---|---|
| AC-014-01 | ADDED | Given an import workbook with the Export's headers and 3 valid rows, when an Editor imports it, then it answers 201 with `created` 3 and 3 `contactIds` in row order, and each Contact holds its row's Predefined fields, Tags and Attributes. | BR-20, BR-22 |
| AC-014-02 | ADDED | Given an Export of Workspace W, when it is imported into another Workspace V, then V holds one new Contact per exported Contact with equal Predefined fields, Tags and Attributes. | BR-20, BR-17 |
| AC-014-03 | ADDED | Given an import workbook whose headers are `FIRSTNAME`, `Email`, `id`, `tags` and `kompetenca` in this order, when it is imported, then the first two fill first name and email, `id` is ignored, `tags` fills the Tags and `kompetenca` becomes an Attribute. | BR-20 |
| AC-014-04 | ADDED | Given an import row with empty cells, values with leading and trailing spaces and a Tag cell `a, ,b ,` , when it is imported, then empty cells are absent, values are trimmed and the Contact has exactly the Tags `a` and `b`; an entirely empty row creates nothing. | BR-20, BR-07 |
| AC-014-05 | ADDED | Given an import workbook whose row 3 has an invalid email, when it is imported, then it is rejected (HTTP 400) with an error for `rows[3].email`, and no Contact and no Tag of the workbook exists afterwards. | BR-21 |
| AC-014-06 | ADDED | Given an import workbook whose row 4 has no first name, last name or email, when it is imported, then it is rejected (HTTP 400) with an error for `rows[4]`. | BR-21, BR-07 |
| AC-014-07 | ADDED | Given an import workbook with a header that is not a valid Attribute key, or two headers equal case-insensitively, when it is imported, then it is rejected (HTTP 400) with an error for `headers[<column number>]` of that header (columns counted from 1). | BR-21, BR-09 |
| AC-014-08 | ADDED | Given an upload that is not an `.xlsx` workbook, a workbook with only a header row, or one with more than 10,000 data rows, when it is imported, then it is rejected (HTTP 400) with an error for `file`. | BR-21 |
| AC-014-09 | ADDED | Given an import workbook with a formula cell in row 2, when it is imported, then it is rejected (HTTP 400) with an error for row 2 and the formula is never evaluated. | BR-21, SR-12 |
| AC-014-10 | ADDED | Given an import of 2 rows by an Editor, when it succeeds, then each new Contact has exactly one Revision, number 1, type `CREATE`, with the Editor as author. | BR-22, BR-12 |
| AC-014-11 | ADDED | Given an existing Contact with email E, when a workbook is imported whose row 2 has E in other letter case and whose rows 3 and 4 share a phone, then it answers 201, row 2 is reported with the existing Contact and `EMAIL`, and rows 3 and 4 are reported with each other's new Contact and `PHONE`. | BR-22, BR-15 |
| AC-014-12 | ADDED | Given Workspace W, when a Viewer imports a valid workbook, then it is rejected (HTTP 403); when a non-Member does, then it answers 404; in both cases nothing is created. | BR-03, BR-02 |
| AC-014-13 | ADDED | Given the Contact list page of an Editor, when they choose import and pick a valid workbook, then the page reports the number of created Contacts and the list shows them; with an invalid workbook, it shows each error with its row and imports nothing. A Viewer sees no import control. | BR-21, NFR-05 |
| AC-014-14 | ADDED | Given an import row with Slovenian characters (č, š, ž, Č, Š, Ž) in names, company and an Attribute value, when it is imported, then the Contact holds the text unchanged. | BR-08, NFR-01 |

## End-to-end scenarios

Exactly one end-to-end test per scenario; no scenario is merged or split.

| ID | Change | Scenario | Steps and observations | Covers |
|---|---|---|---|---|
| E2E-08 | ADDED | Export and import into another Workspace | In a Workspace with 3 Contacts (Tags, Attributes, Slovenian characters), export all of them. Create a second Workspace and import the downloaded workbook from its Contact list: the page reports 3 created Contacts and lists them with the same values and Tags. Import a workbook with one invalid email: the error names its row, and the list is unchanged. | AC-014-02, AC-014-05, AC-014-13, DoD-P07 |
