# Contact Management

A deliberately simple CRM for one organization: it stores Contacts, labels them with Tags and custom Attributes, keeps a full history of every change, and exports them to Excel.

## People

**Contact**:
A person the organization keeps data about. Has predefined fields (first name, last name, one email, one phone, one address, country, company) plus any number of Attributes and Tags.
_Avoid_: User (for records), person, customer, entry, record

**User**:
Someone who signs in to the system and works with Contacts.
_Avoid_: Contact, account, member

**Company**:
A plain text field on a Contact naming where they work; not a thing in its own right.
_Avoid_: Organization, account

## Access

**Role**:
What a User may do. Every User has exactly one Role, and it applies to all Contacts:
- **Viewer** browses, searches and Exports.
- **Editor** also creates, edits, Tags, Archives, Restores and Merges.
- **Admin** also manages Users, Tags and Attribute Keys, and Erases Contacts.
_Avoid_: Permission level, group

**Invitation**:
An Admin adding someone's email so they can sign in. Only invited emails get access.
_Avoid_: Registration, sign-up

**Deactivation**:
Removing a User's access. The User is never deleted, and their name stays on every Version they made.
_Avoid_: Delete user, remove user

## Labelling

**Tag**:
A short label without a value (e.g. `doNotNotify`, `participant2025`) that puts a Contact in a category. Tags come from one shared list, a Contact can have any number, and no Tag has meaning built into the system.
_Avoid_: Label, category, group

**Attribute**:
A custom key–value pair on a Contact (e.g. `competence=webProgramming`). The value is always text.
_Avoid_: Custom field, property

**Attribute Key**:
An entry in the shared catalog of keys that Attributes use; it is added the first time someone uses it.
_Avoid_: Field name

## History

**Version**:
A snapshot of a Contact at one point in time, including its Tags and Attributes. Every change to a Contact creates a new Version, including Archive, Unarchive, Merge, Unmerge and Restore.
_Avoid_: Revision, snapshot

**Audit Trail**:
The ordered list of a Contact's Versions, showing who changed what and when.
_Avoid_: Log, change log

**Restore**:
Making an earlier Version of a Contact's data current again. It creates a new Version, does not rewrite history, and never changes whether the Contact is Archived.
_Avoid_: Rollback, revert, undo

## Lifecycle

**Archive**:
Hiding a Contact from lists and search while keeping it and its Audit Trail. Can be reversed.
_Avoid_: Delete, remove, deactivate

**Erase**:
Permanently removing a Contact together with its entire Audit Trail and every Merged Contact pointing to it, e.g. for a GDPR request. Cannot be undone.
_Avoid_: Delete, purge, hard delete

## Duplicates

**Duplicate Candidate**:
A pair of Contacts the system suspects are the same person (same email, same phone, or a very similar name plus the same Company or email domain). Only a suggestion; it is never acted on automatically.
_Avoid_: Duplicate, match

**Dismissal**:
A User's decision that a Duplicate Candidate is not a duplicate. The pair is not suggested again unless either Contact's name, email or phone changes.
_Avoid_: Ignore, reject

**Merge**:
Combining one Contact into another. The surviving Contact keeps the values the User picks, all Tags from both, and all Attributes from both (the User picks a value where the same Attribute Key conflicts).
_Avoid_: Combine, dedupe, join

**Merged Contact**:
The Contact that did not survive a Merge. It is hidden, read-only, points to the survivor, and keeps its Audit Trail.
_Avoid_: Deleted duplicate, loser

**Unmerge**:
Turning a Merged Contact back into a normal Contact, exactly as it was just before the Merge. The survivor is not changed.
_Avoid_: Split, undo merge

## Output

**Export**:
An Excel file of the Contacts in the current filtered list, or only the selected ones if a selection exists.
_Avoid_: Download, report

**Export Log**:
The record of every Export: who, when, how many Contacts and with which filter. Visible to Admins.
_Avoid_: Download history
