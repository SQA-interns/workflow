# Acceptance criteria

> Owner: Product owner · Read in: phases 1, 3, 6 · Agent: read-only

This list is an input, the same in every run of this project: the agent does not derive, add, merge or reword criteria. Each criterion states one observable behaviour (Given / When / Then) and cites its story and rules. Paths, fields and status codes are those of `project/02_design/api-contract.md`. "Rejected" always means: the API answers with the stated error status and the error body, and nothing is created, changed or deleted, and no Revision is written. The open questions are answered in `scope.md` (OQ-01 to OQ-12).

Common terms used below:

- *User A*, *User B*: two Users with verified emails, each with a valid token; B is not a Member of A's Workspace unless stated.
- *Workspace W*: a Workspace in which User A is Owner.
- *an Editor*, *a Viewer*: a User who is a Member of W with that Role.
- *valid Contact*: a Contact request with at least one of first name, last name and email filled and every value within the rules of BR-07 to BR-10.

## US-001 Sign-in

| ID | Criterion | Refs |
|---|---|---|
| AC-001-01 | Given a request to any `/api` endpoint, when it has no token, a malformed token, an expired token or a token for another Firebase project, then it is answered with HTTP 401 and no data. | BR-01, SR-01 |
| AC-001-02 | Given a User who never called the API, when they call `GET /api/me` with a valid token, then a User record is created and the response holds their email and whether it is verified. | BR-01 |
| AC-001-03 | Given an existing User whose display name changed at the identity provider, when they call `GET /api/me`, then the response holds the new display name and no second User record exists. | BR-01 |
| AC-001-04 | Given the sign-in page, when a person signs up with email and password and then signs in, then the application shows their Workspace list; after sign-out, opening any application page shows the sign-in page. | BR-01 |

## US-002 Workspaces

| ID | Criterion | Refs |
|---|---|---|
| AC-002-01 | Given User A, when A creates a Workspace with a valid name, then it is created (HTTP 201) with A as Owner and appears in A's Workspace list with Role `OWNER`. | BR-02, BR-03 |
| AC-002-02 | Given User A, when A creates a Workspace whose name is empty, only whitespace or longer than 100 characters, then the request is rejected (HTTP 400) with an error for `name`. | BR-07, Data |
| AC-002-03 | Given User A is Member of two Workspaces and Owner of none of User B's, when A lists Workspaces, then exactly A's two Workspaces are returned, each with A's Role. | BR-02 |
| AC-002-04 | Given Workspace W, when an Owner renames it, then the new name is returned; when an Editor or Viewer tries, then the request is rejected (HTTP 403). | BR-03 |
| AC-002-05 | Given Workspace W with Contacts, Tags and Members, when the Owner deletes it with the exact name as `confirmName`, then it answers 204 and afterwards every former Member gets 404 for W and for every Contact of W. | BR-19 |
| AC-002-06 | Given Workspace W, when the Owner deletes it with a `confirmName` that differs from the name, then the request is rejected (HTTP 400) with an error for `confirmName`. | BR-19 |

## US-003 Members

| ID | Criterion | Refs |
|---|---|---|
| AC-003-01 | Given User B exists with a verified email, when the Owner of W adds B's email (in different letter case) with Role `EDITOR`, then the response has status `ACTIVE` and W appears in B's Workspace list with Role `EDITOR`. | BR-05 |
| AC-003-02 | Given no User with email E exists, when the Owner of W adds E with Role `VIEWER`, then the response has status `PENDING`; when a User with verified email E later calls `GET /api/me`, then W appears in their Workspace list with Role `VIEWER` and the invitation is gone. | BR-05 |
| AC-003-03 | Given a pending invitation for email E, when a User with email E that is not verified signs in, then they do not become a Member; after their email is verified, their next request makes them a Member. | BR-05, SR-04 |
| AC-003-04 | Given a person who is already a Member of W or invited to W, when the Owner adds the same email again, then the request is rejected (HTTP 409). | BR-05 |
| AC-003-05 | Given W with one Owner, when that Owner tries to leave, to remove themselves or to change their own Role, then the request is rejected (HTTP 409) and W still has that Owner. | BR-04 |
| AC-003-06 | Given W with two Owners, when one Owner changes the other's Role to `VIEWER`, then the change is applied and the former Owner can no longer rename W (HTTP 403). | BR-04, BR-06 |
| AC-003-07 | Given an Editor of W, when the Editor leaves W, then W no longer appears in their list and their next request to W is answered with 404. | BR-06, BR-02 |
| AC-003-08 | Given an Editor or Viewer of W, when they try to add a Member, change a Role, remove another Member or cancel an invitation, then the request is rejected (HTTP 403). | BR-03 |
| AC-003-09 | Given a pending invitation in W, when the Owner cancels it and the invited person then signs in with that verified email, then they are not a Member of W. | BR-06 |

## US-004 Workspace isolation

| ID | Criterion | Refs |
|---|---|---|
| AC-004-01 | Given User B is not a Member of W, when B requests any `/api/workspaces/{W}/…` endpoint (Workspace, members, contacts, a Contact, its Revisions, tags, duplicates, merge, export), then each answers 404 with the same body as for a Workspace id that does not exist. | BR-02, SR-03 |
| AC-004-02 | Given a Contact C of W and a Workspace V where User B is Owner, when B requests C through V's path (`/api/workspaces/{V}/contacts/{C}`), or updates, deletes, restores, purges or merges it there, then each answers 404 and C is unchanged. | BR-02, SR-03 |
| AC-004-03 | Given W and V both contain Contacts with the same email, name and Tag names, when a Member of V searches, filters, lists Tags, lists Duplicate sets or exports by filter in V, then no Contact, Tag or count of W is included. | BR-02, BR-10, BR-15 |
| AC-004-04 | Given User B is not a Member of W, when B opens W's Workspace page or a Contact page of W by its URL in the browser, then the page shows a "not found" message and no data of W. | BR-02 |
| AC-004-05 | Given a request body or query that names a Workspace id, Role, author or User id other than allowed by the path and the caller's own membership, when it is sent, then that value is ignored or rejected and never grants access. | BR-03, SR-03 |

## US-005 Contacts

| ID | Criterion | Refs |
|---|---|---|
| AC-005-01 | Given W, when an Editor creates a valid Contact with every Predefined field filled, then it is created (HTTP 201) with `version` 1 and the response holds every value as stored. | BR-07, BR-12 |
| AC-005-02 | Given W, when an Editor creates a Contact with first name, last name and email all absent or only whitespace, then the request is rejected (HTTP 400) with an error. | BR-07 |
| AC-005-03 | Given W, when an Editor creates a valid Contact whose text values have leading and trailing spaces, then the stored values have them removed and a value that was only spaces is `null`. | BR-07 |
| AC-005-04 | Given W, when a Contact has an email in an invalid format, a country that is not an ISO 3166-1 alpha-2 code, or any value longer than its limit, then the request is rejected (HTTP 400) with an error for that field; a valid lower-case country is stored in upper case. | BR-08, Data |
| AC-005-05 | Given a Contact with Slovenian characters (č, š, ž, Č, Š, Ž) in every text field, when it is created and read back, then every value is unchanged. | BR-08, NFR-01 |
| AC-005-06 | Given a Contact at version 2, when an Editor updates it naming version 2, then it is changed and its version is 3; when the request names version 1, then it is rejected (HTTP 409) and nothing changes. | BR-12, BR-13 |
| AC-005-07 | Given an active Contact, when an Editor deletes it naming its current version, then it answers 204, the Contact no longer appears in the list, `GET` on it returns `deleted: true`, and its Revisions are all still listed plus one `DELETE` Revision. | BR-14 |
| AC-005-08 | Given W, when a Viewer tries to create, update, delete or restore a Contact, then the request is rejected (HTTP 403). | BR-03 |
| AC-005-09 | Given the Contact form, when an Editor submits it with an invalid email or with first name, last name and email all empty, then the page shows the errors next to the fields and sends no request; when the backend rejects a value, its error is shown next to that field and the entered values remain. | BR-07, NFR-03 |

## US-006 Attributes

| ID | Criterion | Refs |
|---|---|---|
| AC-006-01 | Given W, when an Editor saves a Contact with Attributes `kompetenca=spletnoProgramiranje` and `jezik=nemščina`, then both are returned in the order given. | BR-09 |
| AC-006-02 | Given W, when an Attribute key does not match the key pattern, then the request is rejected (HTTP 400) with an error for that Attribute's key. | BR-09 |
| AC-006-03 | Given W, when a Contact has two Attributes whose keys differ only in letter case, then the request is rejected (HTTP 400) with an error for the second one. | BR-09 |
| AC-006-04 | Given W, when an Attribute key equals a Predefined field name, `id` or `tags` in any letter case (`Email`, `TAGS`), then the request is rejected (HTTP 400) with an error for that key. | BR-09 |
| AC-006-05 | Given W, when an Attribute value is empty or longer than 500 characters, or a Contact has more than 100 Attributes, then the request is rejected (HTTP 400). | BR-09, Data |
| AC-006-06 | Given a Contact with Attributes `a` and `b`, when an Editor updates it with only `a` (changed value), then the Contact has only `a` with the new value. | BR-09, BR-12 |

## US-007 Tags

| ID | Criterion | Refs |
|---|---|---|
| AC-007-01 | Given W has no Tag `udelezenec2025`, when an Editor saves a Contact with that Tag, then the Tag exists in W's Tag list with `contactCount` 1. | BR-10 |
| AC-007-02 | Given W has Tag `neObvescaj`, when an Editor saves another Contact with `NEOBVESCAJ`, then no new Tag is created, both Contacts show `neObvescaj` and its `contactCount` is 2. | BR-10 |
| AC-007-03 | Given W, when a Tag contains a space or another character outside the pattern, is longer than 50 characters, is repeated on one Contact (in any letter case), or a Contact has more than 50 Tags, then the request is rejected (HTTP 400). | BR-10, Data |
| AC-007-04 | Given Tag `udelezenec2025` on two Contacts, when an Editor renames it to `udelezenec2026`, then both Contacts show the new name and each has a new `UPDATE` Revision. | BR-10, BR-12 |
| AC-007-05 | Given W has Tags `a` and `b`, when an Editor renames `a` to `B`, then the request is rejected (HTTP 409) and both Tags are unchanged. | BR-10 |
| AC-007-06 | Given Tag `neObvescaj` on two Contacts, when an Editor deletes it, then it is gone from W's Tag list and from both Contacts, and each has a new `UPDATE` Revision. | BR-10, BR-12 |
| AC-007-07 | Given W, when a Viewer tries to rename or delete a Tag, then the request is rejected (HTTP 403). | BR-03 |

## US-008 Search and filter

| ID | Criterion | Refs |
|---|---|---|
| AC-008-01 | Given Contacts `Saša Novak`, `Sasa Kranjc` and `Ana Šuštar`, when a Member searches `sasa`, then exactly the first two are returned; when they search `SUŠ`, then exactly `Ana Šuštar` is returned. | BR-11 |
| AC-008-02 | Given Contacts whose email, phone, company or city contain the text `primer`, when a Member searches `primer`, then each of them is returned and no Contact without the text in those fields. | BR-11 |
| AC-008-03 | Given Contacts with Tags {x}, {y} and {x, y}, when a Member filters `tag=x&tag=y`, then only the Contact with both is returned; with `tagMode=any`, all three are returned. | BR-11 |
| AC-008-04 | Given Contacts with Attributes `kompetenca=spletnoProgramiranje`, `kompetenca=oblikovanje` and none, when a Member filters `attr=kompetenca=SPLETNOprogramiranje`, then only the first is returned; with `attr=kompetenca`, the first two. | BR-11, BR-09 |
| AC-008-05 | Given Contacts in different countries and companies, when a Member filters by `country=si` and `company=primer d.o.o.` together with a search text, then only Contacts matching all three conditions are returned. | BR-11 |
| AC-008-06 | Given 30 matching Contacts, when a Member requests `page=1&size=25` sorted by `lastName`, then 5 Contacts are returned, `totalItems` is 30 and the order continues the first page without repeats; `size=101` is rejected (HTTP 400) for `size`. | BR-11 |
| AC-008-07 | Given active and Deleted contacts, when a Member lists without `deleted`, then no Deleted contact is returned; with `deleted=true`, only Deleted contacts are returned. | BR-11, BR-14 |
| AC-008-08 | Given the Contact list page, when a Member types a search text and picks a Tag and an Attribute filter, then the list shows only matching Contacts and the total count, without a page reload. | BR-11, NFR-03 |

## US-009 Revisions

| ID | Criterion | Refs |
|---|---|---|
| AC-009-01 | Given a Contact created by an Editor and then updated by the Owner, when a Member lists its Revisions, then there are two, newest first, numbered 2 and 1, with change types `UPDATE` and `CREATE`, the right author each, and the full state after each change. | BR-12 |
| AC-009-02 | Given a Contact with Revisions 1 to 3, when an Editor restores Revision 1 naming version 3, then a Revision 4 of type `RESTORE` exists, the Contact's fields, Attributes and Tags equal those of Revision 1, and Revisions 1 to 3 are unchanged. | BR-12, BR-14 |
| AC-009-03 | Given a Revision whose Tag has since been deleted from the Workspace, when it is restored, then the Tag exists again in the Workspace and is on the Contact. | BR-10, BR-14 |
| AC-009-04 | Given a Deleted contact, when an Editor restores it naming its current version, then it is active again with its last state and has a new `RESTORE` Revision; restoring one of its Revisions before that is rejected (HTTP 409). | BR-14 |
| AC-009-05 | Given two Members load the same Contact at version 2, when both save a change naming version 2, then exactly one change is applied and the other is rejected (HTTP 409). | BR-13 |
| AC-009-06 | Given a Contact with several Revisions, when a Member opens its history page, then each Revision shows its number, author, time, change type and the fields, Attributes and Tags that differ from the Revision before it, with old and new values. | BR-12 |
| AC-009-07 | Given the history page, when an Editor restores an earlier Revision, then the Contact page shows the restored values; for a Viewer no restore control is shown. | BR-03, BR-14 |
| AC-009-08 | Given any Revision, when a client tries to change or delete it through any endpoint, then no such endpoint exists (HTTP 404 or 405) and the Revision is unchanged. | BR-12 |

## US-010 Duplicate detection

| ID | Criterion | Refs |
|---|---|---|
| AC-010-01 | Given Contacts with emails `Ana@Primer.si` and `ana@primer.si`, when a Member lists Duplicate sets, then one set holds both with `matchedOn` containing `EMAIL`. | BR-15 |
| AC-010-02 | Given Contacts with phones `00386 41 123 456` and `+386-41-123-456`, when a Member lists Duplicate sets, then one set holds both with `PHONE`; phones `12345` and `12345` (fewer than 6 digits) form no set. | BR-15 |
| AC-010-03 | Given Contacts `Saša Novak` and `sasa  NOVAK`, when a Member lists Duplicate sets, then one set holds both with `NAME`; Contacts with only first name `Saša` form no set. | BR-15 |
| AC-010-04 | Given A and B share an email and B and C share a phone, when a Member lists Duplicate sets, then A, B and C are one set with `matchedOn` `EMAIL` and `PHONE`. | BR-15 |
| AC-010-05 | Given a Duplicate set of two Contacts, when one of them is deleted, then the set is no longer listed. | BR-14, BR-15 |
| AC-010-06 | Given a Contact with email E, when an Editor creates or updates another Contact with email E, then it is saved (HTTP 201 or 200) and `possibleDuplicates` names the first Contact with `EMAIL`; without a match, `possibleDuplicates` is empty. | BR-15 |
| AC-010-07 | Given the Contact form, when the saved Contact has possible duplicates, then the page shows a warning naming them with links to them and the Contact stays saved. | BR-15, NFR-05 |

## US-011 Merge

| ID | Criterion | Refs |
|---|---|---|
| AC-011-01 | Given Contacts S (phone empty, Tag x, Attribute `a=1`) and D (phone P, Tag y, Attribute `b=2`), when an Editor merges them with S as Survivor and no sources, then S has phone P, Tags x and y, Attributes `a=1` and `b=2`, and a `MERGE` Revision. | BR-16 |
| AC-011-02 | Given S and D with different emails, when an Editor merges them with `fieldSources` `email` = D, then S has D's email. | BR-16 |
| AC-011-03 | Given S and D both with Attribute `kompetenca` but different values, when an Editor merges them with `attributeSources` `kompetenca` = D, then S has D's value; without that source, S keeps its own. | BR-16 |
| AC-011-04 | Given a Merge of S, D and E, when it succeeds, then D and E are Deleted contacts with `mergedInto` = S and a `MERGED_AWAY` Revision each, and none of the three is in a Duplicate set any more. | BR-14, BR-16 |
| AC-011-05 | Given a Merge request, when it lists fewer than 2 or more than 10 Contacts, repeats one, names a Survivor or source not in the list, or includes a Deleted contact, then it is rejected (HTTP 400). | BR-16 |
| AC-011-06 | Given a Merge request, when any listed Contact's version is outdated, then it is rejected (HTTP 409) and none of the Contacts changes. | BR-13, BR-16 |
| AC-011-07 | Given the Duplicates page, when an Editor opens a Duplicate set, picks the Survivor and, for each differing field, the value to keep, and confirms, then the page shows the Survivor with the chosen values and the set is gone from the page. | BR-16, NFR-05 |
| AC-011-08 | Given W, when a Viewer tries to merge, then the request is rejected (HTTP 403). | BR-03 |

## US-012 Export

| ID | Criterion | Refs |
|---|---|---|
| AC-012-01 | Given 5 active Contacts, when a Member exports `contactIds` of 2 of them, then the workbook has the header row and exactly those 2 rows. | BR-17 |
| AC-012-02 | Given Contacts with and without Tag `udelezenec2025`, when a Member exports with a filter on that Tag, then the workbook has exactly the matching Contacts, in the filter's sort order. | BR-17, BR-11 |
| AC-012-03 | Given exported Contacts with Attribute keys `kompetenca` and `Jezik`, when the workbook is opened, then the columns are the fixed columns in contract order, then `jezik`, then `kompetenca`, each Contact's values in its row, and the Tags joined by `, `. | BR-17 |
| AC-012-04 | Given a Contact with Slovenian characters and a value starting with `=`, `+`, `-` or `@`, when it is exported, then the cells contain the text unchanged, as text, not as a formula. | BR-08, NFR-01, SR-06 |
| AC-012-05 | Given an Export request, when it gives both or neither of `contactIds` and `filter`, names a Deleted contact or a Contact of another Workspace, or would hold more than 10,000 Contacts, then it is rejected (HTTP 400). | BR-17, BR-02 |
| AC-012-06 | Given the Contact list page, when a Member selects Contacts with checkboxes and chooses export, then a `.xlsx` file named after the Workspace and the date is downloaded with those Contacts; with nothing selected, the export holds all Contacts matching the current search and filters. | BR-17, NFR-05 |
| AC-012-07 | Given a Viewer of W, when the Viewer exports, then the Export succeeds (HTTP 200). | BR-03 |

## US-013 Permanent erasure

| ID | Criterion | Refs |
|---|---|---|
| AC-013-01 | Given a Deleted contact with Revisions, when the Owner purges it, then it answers 204, and afterwards `GET` on the Contact and on its Revisions answers 404 and the database holds no row of it or its Revisions. | BR-18 |
| AC-013-02 | Given an active Contact, when the Owner tries to purge it, then the request is rejected (HTTP 409) and the Contact is unchanged. | BR-18 |
| AC-013-03 | Given a Deleted contact, when an Editor or Viewer tries to purge it, then the request is rejected (HTTP 403). | BR-03, BR-18 |

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

## Traceability

| Story | Criteria |
|---|---|
| US-001 | AC-001-01 … AC-001-04 |
| US-002 | AC-002-01 … AC-002-06 |
| US-003 | AC-003-01 … AC-003-09 |
| US-004 | AC-004-01 … AC-004-05 |
| US-005 | AC-005-01 … AC-005-09 |
| US-006 | AC-006-01 … AC-006-06 |
| US-007 | AC-007-01 … AC-007-07 |
| US-008 | AC-008-01 … AC-008-08 |
| US-009 | AC-009-01 … AC-009-08 |
| US-010 | AC-010-01 … AC-010-07 |
| US-011 | AC-011-01 … AC-011-08 |
| US-012 | AC-012-01 … AC-012-07 |
| US-013 | AC-013-01 … AC-013-03 |
| US-014 | AC-014-01 … AC-014-14 |

Total: 101 criteria.

Requirements without their own criterion, covered in the specification and verified in phase 6: SR-05 rate and size limits, NFR-02 persistence across container recreation, NFR-04 health and readiness, NFR-07 list response time with 10,000 Contacts (runtime demonstration), NFR-06 accessibility (checked within the end-to-end tests).
