# CR-000: Workspace activity

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

- Type: add
- Baseline: filled by sign-change.mjs
- Requested by: <operator> · Approved: pending
- Security impact: a new read endpoint lists the Revisions of a Workspace with author emails to every Member (SR-13; isolation as SR-03, BR-02); no new personal data is collected.

## Intent

As a Member, I want one feed of every change made to the Contacts of my Workspace, newest first, so that I see what my colleagues changed without opening each Contact. The exclusion of "a Workspace-wide activity feed" in US-009 is lifted by US-015; everything else US-009 excludes stays excluded.
Out of scope: changes to memberships, Tags or the Workspace itself as separate entries, notifications, export of the feed.

## Stories

### US-015 Workspace activity

As a Member, I want one feed of every change made to the Contacts of my Workspace, newest first, so that I see what my colleagues changed without opening each Contact.
In scope: a feed of all Revisions of the Workspace, filters by author, change type and Contact, pagination, a link from each entry to its Contact (BR-23, BR-24). Out of scope: changes to memberships, Tags or the Workspace itself as separate entries, notifications, export of the feed.

## Rules and data

| ID | Change | Rule |
|---|---|---|
| BR-23 | ADDED | The activity of a Workspace lists every Revision of its Contacts, Deleted contacts included, newest first (by time, then by Revision number descending, then by Contact id). Each entry shows the Contact, the Revision number, the change type, the author, the time, and the Contact's first name, last name and email as they were in that Revision. A purged Contact has no entries. |
| BR-24 | ADDED | The activity can be filtered by author, by one or more change types (any of them) and by Contact; filters combine with AND. It is paged like the Contact list: pages from 0, 25 entries by default, at most 100, with the total number of entries. Every Role may read it. |

## Design and quality

| ID | Change | Requirement | Checked by |
|---|---|---|---|
| SR-13 | ADDED | The activity lists only Revisions of Contacts of the path's Workspace, never of another Workspace, also for a User who is Member of several; it shows authors by user id and email only. | acceptance tests |
| DoD-P08 | ADDED | Against the running local stack: after a create, an update, a delete and a Merge, the activity lists the matching entries newest first with their authors; a non-Member gets 404. | runtime demonstration log |

## Baseline items changed

none

## Must not change

AC-004-01..05, AC-005-06..07, AC-007-04..06, AC-009-01..08, AC-011-01..08, AC-013-01..03, E2E-01..07, BR-02, BR-12, BR-14, BR-16, BR-18, SR-03, SR-07, AR-04, AR-08, AR-09.

## Open questions

none
