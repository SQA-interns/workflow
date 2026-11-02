# ADR-0001: Workspaces in one shared schema, isolated by one access layer

Status: accepted (supersedes the earlier single-tenant draft, per spec #1)

Each project or company is a Workspace in one deployment. All Workspace-owned rows (Contacts, Attributes, Tags, Revisions, memberships, invitations) live in one shared PostgreSQL schema and carry the Workspace id.

Isolation lives in one Workspace-scoped access layer. `WorkspaceAccess` is the only code that turns a Workspace id and the caller into a `WorkspaceScope`, and it does so only after reading the caller's membership from PostgreSQL. Every store of Workspace-owned data takes a `WorkspaceScope` as its first parameter and filters by its Workspace id. A non-Member gets the same 404 as for a Workspace that does not exist. An ArchUnit rule (`ArchitectureTest`) enforces that only the store package touches JDBC, that every store method takes a `WorkspaceScope`, and that only `WorkspaceAccess` creates one.

Rejected: row-level security and schema per Workspace. They are stronger, but they make migrations, connection handling and tests heavier than this simple product needs.
