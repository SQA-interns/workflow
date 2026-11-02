# Acceptance criteria: CR-000

> Written in: prepared change request · Source: the requester's specification · Agent: read-only

Same rules as the baseline list: one observable behaviour per row (Given / When / Then), each citing its story and rules. Terms the baseline defines ("rejected", "valid Contact", "User A", "Workspace W") keep their meaning here. The agent does not derive, add, merge or reword criteria.

## US-015 Workspace activity

| ID | Change | Criterion | Refs |
|---|---|---|---|
| AC-015-01 | ADDED | Given an Editor creates Contact C1, the Owner then updates C1 and the Editor then creates C2, when a Member requests the activity, then it lists, in this order, C2 Revision 1 `CREATE` by the Editor, C1 Revision 2 `UPDATE` by the Owner and C1 Revision 1 `CREATE` by the Editor, each with its time. | BR-23 |
| AC-015-02 | ADDED | Given Contact C created as `Ana Novak` and renamed to `Maja Novak`, when a Member requests the activity, then the entry of Revision 1 shows `Ana` and the entry of Revision 2 shows `Maja`. | BR-23 |
| AC-015-03 | ADDED | Given a Contact that was deleted and restored, when a Member requests the activity, then it lists its `DELETE` and `RESTORE` entries, and a Deleted contact's entries stay listed. | BR-23, BR-14 |
| AC-015-04 | ADDED | Given a Merge of S with D and E, when a Member requests the activity, then it lists one `MERGE` entry for S and one `MERGED_AWAY` entry each for D and E. | BR-23, BR-16 |
| AC-015-05 | ADDED | Given a Tag on two Contacts is renamed, when a Member requests the activity, then it lists one `UPDATE` entry for each of the two Contacts. | BR-23, BR-10 |
| AC-015-06 | ADDED | Given entries by the Owner and by an Editor, when a Member filters by the Editor's user id, then only the Editor's entries are listed and the total counts only them. | BR-24 |
| AC-015-07 | ADDED | Given entries of types `CREATE`, `UPDATE` and `DELETE`, when a Member filters `changeType=CREATE&changeType=DELETE`, then only `CREATE` and `DELETE` entries are listed. | BR-24 |
| AC-015-08 | ADDED | Given entries of several Contacts, when a Member filters by one Contact id, then only that Contact's entries are listed, newest first. | BR-24 |
| AC-015-09 | ADDED | Given entries by two authors of several types, when a Member filters by author and change type together, then only entries matching both are listed. | BR-24 |
| AC-015-10 | ADDED | Given 30 entries, when a Member requests `page=1&size=25`, then 5 entries are listed, `totalItems` is 30 and they continue the first page without repeats. | BR-24 |
| AC-015-11 | ADDED | Given the activity request, when `changeType` is unknown, `size` is 0 or above 100, `page` is negative, or `author` or `contactId` is not a valid id, then it is rejected (HTTP 400) with an error for that parameter. | BR-24 |
| AC-015-12 | ADDED | Given a Deleted contact with entries, when the Owner purges it, then the activity no longer lists any of its entries. | BR-23, BR-18 |
| AC-015-13 | ADDED | Given a User who is Member of Workspaces W and V with changes in both, when they request W's activity, then no entry of V is listed, and a non-Member of W gets 404. | BR-02, SR-13 |
| AC-015-14 | ADDED | Given Workspace W, when a Viewer requests the activity, then it answers 200 with the entries. | BR-24, BR-03 |
| AC-015-15 | ADDED | Given the activity page, when a Member opens it, then it shows the entries newest first with author, time, change type and the Contact's name linking to the Contact page, and lets the Member filter by author and change type. | BR-23, BR-24, NFR-05 |

## End-to-end scenarios

Exactly one end-to-end test per scenario; no scenario is merged or split.

| ID | Change | Scenario | Steps and observations | Covers |
|---|---|---|---|---|
| E2E-09 | ADDED | Following the Workspace activity | The Owner invites an Editor. The Editor creates a Contact; the Owner updates it and creates another. The Owner opens the activity page: three entries newest first with the right authors and change types. Filter by the Editor: one entry. Open that entry: the Contact page is shown. | AC-015-01, AC-015-06, AC-015-15, DoD-P08 |
