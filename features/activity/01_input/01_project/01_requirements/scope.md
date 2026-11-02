# Scope

> Owner: Product owner · Read in: phases 1, 6 · Agent: read-only

## In scope

- Sign-in through Firebase Authentication (email and password, Google) and the application's own authorization (US-001, US-003)
- Workspaces with Members and Roles, and strict isolation between Workspaces (US-002, US-003, US-004)
- Contacts with Predefined fields, Attributes and Tags (US-005, US-006, US-007)
- Search, filtering, sorting and pagination (US-008)
- Revisions, Restore and protection against lost updates (US-009)
- Workspace activity feed of all Revisions (US-015)
- Duplicate detection and Merge (US-010, US-011)
- Excel Export of a selection or of a filter (US-012)
- Permanent erasure of a Contact and of a Workspace (US-013, US-002)
- A Slovenian user interface whose main pages meet the accessibility check of NFR-06

## Out of scope

- Import of Contacts (Excel, CSV, vCard or any other source)
- Fuzzy or similarity-based duplicate matching
- Sending any email (invitations, notifications)
- Typed Attributes, a Workspace-wide Attribute schema, several values per Attribute key
- Moving or copying Contacts between Workspaces
- Translations other than Slovenian; an internationalisation framework
- Multi-factor authentication, roles granted by the identity provider (Firebase custom claims)
- Database-level tenant isolation (row-level security, schema per Workspace): ADR-0001
- An administration interface across Workspaces
- Mobile applications

## Priorities

1. Isolation: no Workspace data ever reaches a non-Member (BR-02, US-004) comes before every feature.
2. No change is lost: Revisions and the version check (BR-12, BR-13) come before convenience features.
3. Security and privacy (`project/02_design/security-requirements.md`) come before convenience.
4. Simplicity of use: fewer steps and fewer settings win over more options.
5. Core flow first: US-001 to US-009 come before US-010 to US-013.

## Open questions

| ID | Question | Owner | Answer |
|---|---|---|---|
| OQ-01 | What should the tenant be called, and what does it hold? | Product owner | A Workspace: only a name; every Contact belongs to exactly one Workspace. |
| OQ-02 | Can other people use a Workspace, and with what rights? | Product owner | Yes, as Members with the Roles Owner, Editor and Viewer and the permissions of `business-rules.md`; a User may belong to many Workspaces. |
| OQ-03 | How is isolation enforced, and what does a non-Member see? | Architect | Shared schema with the Workspace id on every row, enforced by the backend (ADR-0001); a non-Member gets 404, the same as for something that does not exist. |
| OQ-04 | Are custom fields free, or defined per Workspace first? | Product owner | Free per Contact, string values (BR-09). |
| OQ-05 | What does "izvoz označenih kontaktov" mean? | Product owner | Either the Contacts selected in the list or all Contacts matching the current search and filters (BR-17). |
| OQ-06 | Is Excel import part of the integration? | Product owner | No; export only. Import is a candidate change request. |
| OQ-07 | What makes two Contacts duplicates? | Product owner | Exact match after normalisation of email, phone or full name, grouped transitively (BR-15); no fuzzy matching. |
| OQ-08 | Which Contacts can be merged? | Product owner | Any 2 to 10 active Contacts of one Workspace chosen by an Editor or Owner, not only a detected Duplicate set (BR-16). |
| OQ-09 | How are new Members invited when the system sends no email? | Product owner | By email address; a pending invitation is activated at the invitee's first signed-in request with that verified email; the Owner tells the person themselves (BR-05). |
| OQ-10 | Is a deleted Contact gone? | Product owner | No: it becomes a Deleted contact and can be restored; only an Owner's purge (BR-18) or deleting the Workspace (BR-19) removes data permanently. |
| OQ-11 | Which language does the user interface use? | Product owner | Slovenian only, no translation framework. API error messages are in English; the frontend shows its own Slovenian text for them. |
| OQ-12 | How long are Contacts and Revisions kept? | Product owner | Until a Member purges them or deletes the Workspace; no automatic deletion. The release notes tell the operator that erasure requests are fulfilled with purge. |

The answers are the product owner's decisions and hold for every run of this project; the agent records no decision for them. A new question that arises later becomes a decision record as usual.
