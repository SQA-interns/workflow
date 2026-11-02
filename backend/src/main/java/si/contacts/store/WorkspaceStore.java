package si.contacts.store;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.workspace.WorkspaceScope;

/** The Workspace row itself, reached only through a WorkspaceScope. */
@Repository
public class WorkspaceStore {
  private final JdbcClient db;

  public WorkspaceStore(JdbcClient db) {
    this.db = db;
  }

  public String name(WorkspaceScope scope) {
    return db.sql("SELECT name FROM workspaces WHERE id = ?").param(scope.workspaceId()).query(String.class).single();
  }

  public void rename(WorkspaceScope scope, String name) {
    db.sql("UPDATE workspaces SET name = ? WHERE id = ?").params(name, scope.workspaceId()).update();
  }

  /** Removes the Workspace and, by cascade, everything it owns. */
  public void delete(WorkspaceScope scope) {
    db.sql("DELETE FROM workspaces WHERE id = ?").param(scope.workspaceId()).update();
  }
}
