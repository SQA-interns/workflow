package si.contacts.store;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.workspace.Membership;

/** Membership facts needed before a WorkspaceScope exists. Used only by WorkspaceAccess. */
@Repository
public class AccessStore {
  private final JdbcClient db;

  public AccessStore(JdbcClient db) {
    this.db = db;
  }


  public Optional<String> roleOf(UUID workspaceId, UUID userId) {
    return db.sql("SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?")
        .params(workspaceId, userId)
        .query(String.class)
        .optional();
  }

  public void lockWorkspace(UUID workspaceId) {
    db.sql("SELECT id FROM workspaces WHERE id = ? FOR UPDATE").param(workspaceId).query(UUID.class).optional();
  }

  public UUID createWorkspace(String name, UUID ownerId) {
    UUID id = UUID.randomUUID();
    db.sql("INSERT INTO workspaces (id, name) VALUES (?, ?)").params(id, name).update();
    db.sql("INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, 'OWNER')").params(id, ownerId).update();
    return id;
  }

  public List<Membership> workspacesOf(UUID userId) {
    return db.sql(
            "SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id"
                + " WHERE m.user_id = ? ORDER BY lower(w.name), w.id")
        .param(userId)
        .query((rs, i) -> new Membership(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
        .list();
  }

  /** Turns pending invitations for the verified email into memberships, then removes them. */
  public void activateInvitations(UUID userId, String emailLower) {
    db.sql(
            "WITH taken AS (DELETE FROM invitations WHERE email_lower = ? RETURNING workspace_id, role)"
                + " INSERT INTO memberships (workspace_id, user_id, role)"
                + " SELECT workspace_id, ?, role FROM taken ON CONFLICT DO NOTHING")
        .params(emailLower, userId)
        .update();
  }
}
