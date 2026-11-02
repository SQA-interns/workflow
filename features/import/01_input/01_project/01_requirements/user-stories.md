# User stories

> Owner: Product owner · Read in: phases 1, 6 · Agent: read-only

## Format

- Stories: `US-nnn`, "As a … I want … so that …", plus in-scope and out-of-scope notes.
- Acceptance criteria are given in `acceptance-criteria.md` as `AC-nnn-nn` (Given/When/Then), one observable behaviour each, each citing its `US` and any `BR`; the agent does not derive them.
- Do not invent behaviour a story does not state; record the gap as an `OQ` in `scope.md`.

## Stories

Epic: as someone who works with many people on a project or in a company, I want to keep their contacts in one simple, private place, so that I can find, categorise and hand them on without a heavyweight CRM.

The terms Workspace, Member, Role (Owner, Editor, Viewer), Contact, Predefined field, Attribute, Tag, Revision, Deleted contact, Restore, Duplicate set, Merge, Survivor and Export are defined in `business-rules.md` ("Glossary").

### US-001 Sign-in

As a User, I want to sign in with email and password or with my Google account, so that only I can reach my Workspaces.
In scope: sign-up, sign-in and sign-out through Firebase Authentication; the application's own User record, created at the first sign-in (BR-01). Out of scope: password reset screens beyond what Firebase provides, multi-factor authentication.

### US-002 Workspaces

As a User, I want to create Workspaces for my projects and companies, see the ones I belong to, rename them and delete them, so that I keep the contacts of each apart.
In scope: create (the creator becomes Owner), list with my Role, rename, delete with name confirmation (BR-02, BR-03, BR-16). Out of scope: moving Contacts between Workspaces, Workspace settings other than the name.

### US-003 Members

As an Owner, I want to give other people access to my Workspace with a Role, so that we can keep its contacts together.
In scope: add a Member by email with a Role, pending invitations, change a Role, remove a Member, cancel an invitation, leave a Workspace; at least one Owner always remains (BR-04, BR-05, BR-06). Out of scope: sending invitation emails, invitation links, transferring ownership as a separate action.

### US-004 Workspace isolation

As a Member, I want the contacts of my Workspace to be invisible to everyone who is not a Member, so that our data stays private.
In scope: every Workspace resource, through the UI and directly through the API (BR-02, BR-03, ADR-0001). Out of scope: sharing a single Contact outside its Workspace.

### US-005 Contacts

As an Editor, I want to create, view, change and delete Contacts with their Predefined fields, so that the Workspace holds correct contact data.
In scope: the Predefined fields and their rules (BR-07, BR-08), deleting as a Deleted contact (BR-12). Out of scope: photos, several emails or phones per Contact, relations between Contacts.

### US-006 Attributes

As an Editor, I want to add free key-value Attributes to a Contact (`kompetenca=spletnoProgramiranje`), so that I can record what the Predefined fields do not cover.
In scope: add, change and remove Attributes on a Contact (BR-09). Out of scope: a Workspace-wide Attribute schema, typed values (numbers, dates), several values per key.

### US-007 Tags

As an Editor, I want to label Contacts with Tags (`neObvescaj`, `udelezenec2025`) and rename or delete a Tag across the Workspace, so that I can group Contacts into categories.
In scope: Tags on a Contact, the Workspace's Tag list with usage counts, Workspace-wide rename and delete (BR-10). Out of scope: Tag colours, Tag hierarchies.

### US-008 Search and filter

As a Member, I want to search, filter, sort and page through the Contacts of a Workspace, so that I find the right people quickly.
In scope: one search box, filters by Tags, country, company and Attributes, sorting, pagination, a separate view of Deleted contacts (BR-11). Out of scope: saved searches, fuzzy search.

### US-009 Revisions

As a Member, I want to see every change made to a Contact, who made it and when, and as an Editor to Restore an earlier state or a Deleted contact, so that no change is lost and mistakes can be undone.
In scope: the Revision list with field-level differences, Restore of a Revision, Restore of a Deleted contact, protection against lost updates (BR-12, BR-13, BR-14). Out of scope: editing or deleting Revisions, a Workspace-wide activity feed.

### US-010 Duplicate detection

As a Member, I want to see which Contacts are probably the same person, both in a Duplicates view and as a warning when I save a Contact, so that the Workspace stays clean.
In scope: Duplicate sets by normalised email, phone or full name (BR-15); a non-blocking warning on create and update. Out of scope: fuzzy or similarity matching, automatic merging.

### US-011 Merge

As an Editor, I want to Merge two or more Contacts into one, choosing which values to keep, so that each person appears only once.
In scope: choosing the Survivor and, per differing value, its source; Tags and Attributes combined; the others become Deleted contacts pointing to the Survivor (BR-16). Out of scope: undoing a Merge in one step.

### US-012 Export

As a Member, I want to export the Contacts I selected, or all Contacts matching my current search and filters, to an Excel workbook, so that I can use them outside the system.
In scope: export of a selection or of a filter, the column layout of `api-contract.md` (BR-17). Out of scope: import from Excel, other formats (CSV, vCard).

### US-013 Permanent erasure

As an Owner, I want to permanently erase a Deleted contact together with its Revisions, so that I can honour a person's request to have their data removed.
In scope: purge of one Deleted contact (BR-18); deletion of a whole Workspace is US-002. Out of scope: scheduled or automatic erasure.

### US-014 Excel import

As an Editor, I want to import Contacts from an Excel workbook laid out like the Export, so that I can bring an existing list into a Workspace without typing it again.
In scope: upload of one `.xlsx` workbook into a Workspace, validation of every row with the Contact rules, all or nothing, a report of possible duplicates (BR-20, BR-21, BR-22). Out of scope: updating existing Contacts from a workbook, CSV, vCard or any other format, a column-mapping dialog.
