# Business rules

> Owner: Product owner · Read in: phases 1, 6 · Agent: read-only

## Rules

| ID | Rule |
|---|---|
| BR-01 | A User is identified by their Firebase user id; the application keeps its own User record (id, email, whether the email is verified, display name), created at the first signed-in request and updated from the token at every later one. |
| BR-02 | Every Contact, Tag, Revision, membership and invitation belongs to exactly one Workspace and never moves to another. Only Members can see a Workspace or anything in it; to everyone else it behaves exactly as if it did not exist. |
| BR-03 | What a Member may do depends only on their Role in that Workspace, as in the table under "Role permissions". A Role is stored by the application; nothing the client or the identity provider sends grants one. |
| BR-04 | A Workspace always has at least one Owner. The last Owner cannot leave, be removed or be given another Role. |
| BR-05 | An Owner adds a Member by email and Role. If a User with that email (compared case-insensitively) exists and their email is verified, they become a Member at once; otherwise a pending invitation is stored. A pending invitation turns into a membership at the first signed-in request of a User whose verified email matches it. A person is at most once a Member or invited per Workspace. No email is sent. |
| BR-06 | Any Member may leave a Workspace (subject to BR-04). An Owner may change any Member's Role, remove any Member and cancel any pending invitation (subject to BR-04). |
| BR-07 | A Contact has the Predefined fields listed under Data. At least one of first name, last name and email is filled. Leading and trailing whitespace is removed from every text value; a value that is empty after that is treated as absent. |
| BR-08 | Email has a valid email format; country is an ISO 3166-1 alpha-2 code (stored in upper case); every text accepts Unicode, including Slovenian characters (č, š, ž, Č, Š, Ž). |
| BR-09 | An Attribute key matches `^[A-Za-z][A-Za-z0-9_]{0,63}$`, is unique on its Contact compared case-insensitively, and never equals, case-insensitively, a Predefined field name, `id` or `tags`. Its value is 1 to 500 characters. |
| BR-10 | A Tag belongs to its Workspace, matches `^[\p{L}\p{N}_-]{1,50}$` and is unique in the Workspace compared case-insensitively; the spelling first used is kept. Naming a Tag that does not exist on a Contact creates it. A Contact has each Tag at most once. Renaming a Tag to a name another Tag of the Workspace already has is rejected. Renaming or deleting a Tag writes a Revision on every Contact that has it. |
| BR-11 | Search and filters see only Contacts that are not Deleted contacts, except in the Deleted view, which sees only Deleted contacts. The search text matches case-insensitively and ignoring diacritics (`sasa` finds `Saša`). |
| BR-12 | Every create, update, delete, Restore and Merge of a Contact writes exactly one Revision on each Contact it changes. Revisions are numbered 1, 2, 3, … per Contact; the Contact's version is the number of its latest Revision. A Revision is never changed and is removed only by BR-18 or BR-19. The author of a Revision is the signed-in User who made the change. |
| BR-13 | A change to a Contact names the version it was based on; if the Contact has a newer version, the change is rejected and nothing is written. |
| BR-14 | Deleting a Contact makes it a Deleted contact: hidden from lists, search, Duplicate sets and Exports, with all Revisions kept. Restoring a Deleted contact makes it active again with its last state. Restoring an earlier Revision of an active Contact writes a new Revision with that Revision's fields, Attributes and Tags. A Deleted contact's Revisions cannot be restored until the Contact itself is restored. |
| BR-15 | Two active Contacts of one Workspace match when their normalised emails are equal, their normalised phones are equal, or their normalised full names are equal. A Duplicate set is a largest group of active Contacts connected by matches (if A matches B and B matches C, A, B and C form one set). Normalisation is defined under "Duplicate matching". |
| BR-16 | A Merge takes 2 to 10 active Contacts of one Workspace and one of them as Survivor. For each Predefined field, the Survivor gets the value of the Contact the user chose for that field; without a choice it keeps its own value, or, if it has none, gets the first filled value in the order the Contacts were given. Tags are the union. Attributes are the union; for a key with different values the user's choice applies, otherwise the same default as for fields. Every other Contact becomes a Deleted contact that points to the Survivor. |
| BR-17 | An Export holds either the Contacts the Member selected or all Contacts matching a search and filter, never Deleted contacts, at most 10,000 Contacts. |
| BR-18 | An Owner may purge a Deleted contact: the Contact and all its Revisions are removed permanently. |
| BR-19 | Deleting a Workspace requires its exact name as confirmation and permanently removes the Workspace with all its Contacts, Revisions, Tags, memberships and invitations. |
| BR-20 | An import reads the first sheet of one `.xlsx` workbook. Its first row holds the column headers: a header equal, case-insensitively, to a Predefined field name of the Export or to `tags` fills that field; `id` is ignored; every other header is an Attribute key, written as in the header. Columns may come in any order. Every following row that is not entirely empty is one Contact; an empty cell is an absent value; Tags are the cell's text split at commas, trimmed, empty pieces ignored. |
| BR-21 | An import is all or nothing: every row is checked with the same rules as creating a Contact (BR-07 to BR-10), every header with BR-09 and for duplicates (case-insensitively); if any row or header breaks a rule, no Contact and no Tag is created and every error is reported with its sheet row number. A workbook that cannot be read, holds no data row or more than 10,000 data rows, or contains a formula cell is rejected as a whole. |
| BR-22 | Each imported row becomes a new Contact with a `CREATE` Revision whose author is the importing User; existing Contacts are never changed. The import reports, per row, the Contacts it matches by BR-15, both existing active Contacts and other rows of the same workbook. |

## Role permissions

| Action | Viewer | Editor | Owner |
|---|---|---|---|
| See the Workspace, its Members and pending invitations; list, search, filter and view Contacts and their Revisions; see Duplicate sets and the Tag list; Export | yes | yes | yes |
| Create, update, delete and Restore Contacts; Merge; rename and delete Tags | | yes | yes |
| Rename the Workspace; add Members; change Roles; remove Members; cancel invitations | | | yes |
| Purge a Deleted contact; delete the Workspace | | | yes |
| Leave the Workspace | yes | yes | yes (BR-04) |

## Data

| Entity | Fields |
|---|---|
| Workspace | name (1 to 100 characters, not unique) |
| Member | User, Role (`OWNER`, `EDITOR`, `VIEWER`) |
| Pending invitation | email, Role, who invited, when |
| Contact: Predefined fields (all optional, BR-07) | first name (≤ 100), last name (≤ 100), email (≤ 254), phone (≤ 30), company (≤ 100), job title (≤ 100), street (≤ 200), postal code (≤ 20), city (≤ 100), country (ISO 3166-1 alpha-2), note (≤ 2,000) |
| Contact: other | at most 100 Attributes (BR-09), at most 50 Tags (BR-10), version, whether it is a Deleted contact, the Survivor it was merged into (if any) |
| Revision | number, change type (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `MERGE` on the Survivor, `MERGED_AWAY` on the others), author, time, the Contact's full state after the change (Predefined fields, Attributes, Tags, Deleted or not) |

Lengths count Unicode characters.

## Duplicate matching

| Value | Normalisation | Matches only when |
|---|---|---|
| Email | lower case | both Contacts have an email |
| Phone | `00` at the start becomes `+`; then every character except digits and a leading `+` is removed | both normalised phones have at least 6 digits |
| Full name | first name and last name joined by one space; lower case; diacritics removed (`č`→`c`, `š`→`s`, `ž`→`z`, `ć`→`c`, `đ`→`d`, and so on); runs of whitespace become one space | both Contacts have a first and a last name |

## Glossary

The design-time copy of these terms is `GLOSSARY.md` at the repository root; the words in the "Avoid" lists are not used in code, API or UI for these concepts.

- User: a person who has signed in at least once. Avoid: account, login.
- Workspace: a named, isolated collection of Contacts created by a User for a project or a company; its only descriptive property is its name. Avoid: group, contact group, project, company, tenant, organization.
- Member: a User who has access to a Workspace, with exactly one Role in it. Avoid: collaborator, participant.
- Role: what a Member may do in a Workspace: Owner, Editor or Viewer. Avoid: permission level, access level.
- Owner: a Member who manages the Workspace and its Members, in addition to everything an Editor may do. Avoid: admin, creator.
- Editor: a Member who may change Contacts, in addition to everything a Viewer may do. Avoid: writer, contributor.
- Viewer: a Member who may read and export Contacts but change nothing. Avoid: reader, guest.
- Contact: a person kept in exactly one Workspace, described by Predefined fields, Attributes and Tags. Avoid: entry, record, person, customer, lead.
- Predefined field: one of the fixed Contact properties every Workspace shares. Avoid: standard field, built-in field, column.
- Attribute: a free key-value pair on one Contact (`kompetenca=spletnoProgramiranje`). Avoid: custom field, property, metadata.
- Tag: a free label, owned by a Workspace, that places Contacts in a category (`neObvescaj`, `udelezenec2025`). Avoid: label, category, group, marker.
- Revision: an immutable, numbered snapshot of a Contact written by every change to it, with who made it, when and what kind of change it was. Avoid: audit entry, history record, change log.
- Deleted contact: a Contact hidden from lists and search that keeps its Revisions and can be restored. Avoid: archived, trashed.
- Restore: bringing back a Deleted contact, or the state of an earlier Revision, as a new Revision. Avoid: undo, rollback, revert.
- Duplicate set: two or more Contacts of one Workspace that match by BR-15. Avoid: duplicates group, match, cluster.
- Merge: combining Contacts into one Survivor; the others become Deleted contacts pointing to it. Avoid: combine, consolidate, dedupe.
- Survivor: the Contact a Merge keeps. Avoid: master, primary, winner.
- Export: an Excel workbook of selected Contacts or of the Contacts matching a search and filter. Avoid: download, report, dump.
