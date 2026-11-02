# Feature package: `activity` (Workspace activity feed)

> Owner: Product owner · Status: proposed 2026-11-02 · Shared by greenfield and brownfield runs, word for word

This file is the complete and only specification of the feature. Both run types use exactly this text:

- **Greenfield:** before the run, every block below is applied to the named file in `01_input/01_project/` (added or replaced exactly as written; `features/build-inputs.py` does it), then the inputs are committed and the run starts as a normal run.
- **Brownfield:** the same requirements, in the change-request format, are `change/` (`change.md`, `acceptance-criteria.md`, `api-contract.md`), copied into a finished run's `04_changes/` and signed.

Fixed ids, the same in both run types and never used by another feature (D-06): `US-015`, `AC-015-nn`, `BR-23`, `BR-24`, `SR-13`, `E2E-09`, `DoD-P08`; the endpoint is added to the fixed API contract (`api-contract.md`, AR-09). Nothing else in the project changes.

---

## 1. `01_requirements/user-stories.md`

In US-009, replace the line starting `In scope: the Revision list with field-level differences` with:

```markdown
In scope: the Revision list with field-level differences, Restore of a Revision, Restore of a Deleted contact, protection against lost updates (BR-12, BR-13, BR-14). Out of scope: editing or deleting Revisions; the Workspace-wide activity feed is US-015.
```

Add at the end:

```markdown
### US-015 Workspace activity

As a Member, I want one feed of every change made to the Contacts of my Workspace, newest first, so that I see what my colleagues changed without opening each Contact.
In scope: a feed of all Revisions of the Workspace, filters by author, change type and Contact, pagination, a link from each entry to its Contact (BR-23, BR-24). Out of scope: changes to memberships, Tags or the Workspace itself as separate entries, notifications, export of the feed.
```

## 2. `01_requirements/business-rules.md`: add two rows to the Rules table

```markdown
| BR-23 | The activity of a Workspace lists every Revision of its Contacts, Deleted contacts included, newest first (by time, then by Revision number descending, then by Contact id). Each entry shows the Contact, the Revision number, the change type, the author, the time, and the Contact's first name, last name and email as they were in that Revision. A purged Contact has no entries. |
| BR-24 | The activity can be filtered by author, by one or more change types (any of them) and by Contact; filters combine with AND. It is paged like the Contact list: pages from 0, 25 entries by default, at most 100, with the total number of entries. Every Role may read it. |
```

## 3. `01_requirements/scope.md`

In "In scope", add the line after the Revisions line:

```markdown
- Workspace activity feed of all Revisions (US-015)
```

## 4. `01_requirements/acceptance-criteria.md`

Insert before "Traceability":

```markdown
## US-015 Workspace activity

| ID | Criterion | Refs |
|---|---|---|
| AC-015-01 | Given an Editor creates Contact C1, the Owner then updates C1 and the Editor then creates C2, when a Member requests the activity, then it lists, in this order, C2 Revision 1 `CREATE` by the Editor, C1 Revision 2 `UPDATE` by the Owner and C1 Revision 1 `CREATE` by the Editor, each with its time. | BR-23 |
| AC-015-02 | Given Contact C created as `Ana Novak` and renamed to `Maja Novak`, when a Member requests the activity, then the entry of Revision 1 shows `Ana` and the entry of Revision 2 shows `Maja`. | BR-23 |
| AC-015-03 | Given a Contact that was deleted and restored, when a Member requests the activity, then it lists its `DELETE` and `RESTORE` entries, and a Deleted contact's entries stay listed. | BR-23, BR-14 |
| AC-015-04 | Given a Merge of S with D and E, when a Member requests the activity, then it lists one `MERGE` entry for S and one `MERGED_AWAY` entry each for D and E. | BR-23, BR-16 |
| AC-015-05 | Given a Tag on two Contacts is renamed, when a Member requests the activity, then it lists one `UPDATE` entry for each of the two Contacts. | BR-23, BR-10 |
| AC-015-06 | Given entries by the Owner and by an Editor, when a Member filters by the Editor's user id, then only the Editor's entries are listed and the total counts only them. | BR-24 |
| AC-015-07 | Given entries of types `CREATE`, `UPDATE` and `DELETE`, when a Member filters `changeType=CREATE&changeType=DELETE`, then only `CREATE` and `DELETE` entries are listed. | BR-24 |
| AC-015-08 | Given entries of several Contacts, when a Member filters by one Contact id, then only that Contact's entries are listed, newest first. | BR-24 |
| AC-015-09 | Given entries by two authors of several types, when a Member filters by author and change type together, then only entries matching both are listed. | BR-24 |
| AC-015-10 | Given 30 entries, when a Member requests `page=1&size=25`, then 5 entries are listed, `totalItems` is 30 and they continue the first page without repeats. | BR-24 |
| AC-015-11 | Given the activity request, when `changeType` is unknown, `size` is 0 or above 100, `page` is negative, or `author` or `contactId` is not a valid id, then it is rejected (HTTP 400) with an error for that parameter. | BR-24 |
| AC-015-12 | Given a Deleted contact with entries, when the Owner purges it, then the activity no longer lists any of its entries. | BR-23, BR-18 |
| AC-015-13 | Given a User who is Member of Workspaces W and V with changes in both, when they request W's activity, then no entry of V is listed, and a non-Member of W gets 404. | BR-02, SR-13 |
| AC-015-14 | Given Workspace W, when a Viewer requests the activity, then it answers 200 with the entries. | BR-24, BR-03 |
| AC-015-15 | Given the activity page, when a Member opens it, then it shows the entries newest first with author, time, change type and the Contact's name linking to the Contact page, and lets the Member filter by author and change type. | BR-23, BR-24, NFR-05 |
```

In the Traceability table, add the row after the US-013 row:

```markdown
| US-015 | AC-015-01 … AC-015-15 |
```

Replace the total:

```markdown
Total: 102 criteria.
```

## 5. `01_requirements/e2e-scenarios.md`: add a row to the table

```markdown
| E2E-09 | Following the Workspace activity | The Owner invites an Editor. The Editor creates a Contact; the Owner updates it and creates another. The Owner opens the activity page: three entries newest first with the right authors and change types. Filter by the Editor: one entry. Open that entry: the Contact page is shown. | AC-015-01, AC-015-06, AC-015-15, DoD-P08 |
```

## 6. `02_design/security-requirements.md`: add a row to "Project requirements"

```markdown
| SR-13 | The activity lists only Revisions of Contacts of the path's Workspace, never of another Workspace, also for a User who is Member of several; it shows authors by user id and email only. |
```

## 7. `02_design/architecture.md`: Interfaces table, add after the Export row

```markdown
| Activity feed | frontend and backend | REST (OpenAPI), part of the API above |
```

## 8. `02_design/quality-requirements.md`: Additional done criteria

```markdown
| DoD-P08 | Against the running local stack: after a create, an update, a delete and a Merge, the activity lists the matching entries newest first with their authors; a non-Member gets 404. | runtime demonstration log |
```

## 9. `02_design/api-contract.md`: add at the end

```markdown
### Activity

`GET /api/workspaces/{workspaceId}/activity` (any Role).

Query parameters, all optional, combined with AND: `author` (a user id), `changeType` (repeatable; any of the given types), `contactId`, `page` (from 0, default 0), `size` (1 to 100, default 25).

Response 200:

    {
      "items": [
        {"contactId": "…", "revisionNumber": 2, "changeType": "UPDATE",
         "author": {"userId": "…", "email": "…"}, "createdAt": "2026-11-02T10:05:00Z",
         "contact": {"firstName": "Maja", "lastName": "Novak", "email": "maja@example.si"}}
      ],
      "page": 0,
      "size": 25,
      "totalItems": 3
    }

`items` are newest first (BR-23); `contact` holds the values of that Revision. Response 400 with the invalid parameter as `field`.
```

---

## Not changed by this feature

`tech-stack.md`, `environments.md`, `pre-approved.md`, `secrets.env.example`, the quality gate, the mutation scope, all general files and `03_statistics/`.
