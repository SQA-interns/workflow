# Contact Management

A deliberately simple, multi-tenant contact manager: people keep the Contacts of one project or company in a Workspace, label them with Tags and Attributes, see every change as a Revision, find Duplicate sets, Merge them and Export to Excel.

## People and access

**User**:
Someone who signs in (Firebase Authentication) and is known to the application by their sign-in identity.
_Avoid_: account, member (for the person in general)

**Workspace**:
The container for the Contacts of one project or company. Only its Members see it; nothing in it is visible from another Workspace.
_Avoid_: group, project, tenant, organization

**Member**:
A User who belongs to a Workspace with exactly one Role there.
_Avoid_: participant, collaborator

**Role**:
What a Member may do in one Workspace:
- **Viewer** reads, searches and Exports.
- **Editor** also creates, changes, deletes, Restores and Merges Contacts and renames or deletes Tags.
- **Owner** also manages Members and invitations, renames and deletes the Workspace and purges Deleted contacts.

A Workspace always has at least one Owner.
_Avoid_: permission level, admin

**Invitation**:
A pending Membership for an email that has no User yet. It becomes a Membership at the first request of a User with that verified email.
_Avoid_: registration, sign-up

## Contacts

**Contact**:
A person the Workspace keeps data about: Predefined fields, Attributes and Tags.
_Avoid_: record, entry, customer

**Predefined field**:
One of the fixed fields of a Contact: first name, last name, email, phone, company, job title, street, postal code, city, country, note.
_Avoid_: column, property

**Attribute**:
A free key–value pair on a Contact (e.g. `kompetenca=spletnoProgramiranje`). The value is always text; keys are unique on a Contact ignoring letter case.
_Avoid_: custom field, property

**Tag**:
A free word that puts Contacts in a category (e.g. `neObvescaj`). Created on first use, the same Tag regardless of letter case.
_Avoid_: label, category, group

## History

**Revision**:
An immutable snapshot of a Contact's full state written by every change, with its number, change type, author and time. The Contact's version is the number of its latest Revision.
_Avoid_: version (in prose), snapshot, log entry

**Deleted contact**:
A Contact that was deleted: hidden from the list, kept with its Revisions, restorable.
_Avoid_: archived, removed

**Restore**:
Making an earlier Revision, or a Deleted contact, current again. It writes a new Revision and never rewrites history.
_Avoid_: rollback, revert, undo

**Purge**:
The Owner's permanent erasure of a Deleted contact together with all its Revisions.
_Avoid_: hard delete, erase

## Duplicates

**Duplicate set**:
Active Contacts of one Workspace that match by normalised email, phone or full name, grouped transitively.
_Avoid_: duplicate candidate, match group

**Merge**:
Combining 2–10 Contacts of a Duplicate set into one Survivor; the others become Deleted contacts pointing to it.
_Avoid_: combine, dedupe, join

**Survivor**:
The Contact that remains after a Merge.
_Avoid_: master, winner

## Output

**Export**:
An `.xlsx` workbook of the selected Contacts or of all Contacts matching the current search and filters.
_Avoid_: download, report
