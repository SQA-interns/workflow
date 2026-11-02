package si.contacts.store;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.workspace.WorkspaceScope;

/** Members and invitations of one Workspace. */
@Repository
public class MemberStore {
  private final JdbcClient db;

  public MemberStore(JdbcClient db) {
    this.db = db;
  }

  public record MemberRow(UUID userId, String email, String displayName, String role) {}

  public record InvitationRow(UUID id, String email, String role, OffsetDateTime createdAt) {}

  public List<MemberRow> members(WorkspaceScope s) {
    return db.sql(
            "SELECT u.id, u.email, u.display_name, m.role FROM memberships m JOIN users u ON u.id = m.user_id"
                + " WHERE m.workspace_id = ? ORDER BY lower(coalesce(u.display_name, u.email)), u.id")
        .param(s.workspaceId())
        .query((rs, i) -> new MemberRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4)))
        .list();
  }

  public Optional<MemberRow> member(WorkspaceScope s, UUID userId) {
    return members(s).stream().filter(m -> m.userId().equals(userId)).findFirst();
  }

  public List<InvitationRow> invitations(WorkspaceScope s) {
    return db.sql("SELECT id, email, role, created_at FROM invitations WHERE workspace_id = ? ORDER BY created_at, id")
        .param(s.workspaceId())
        .query(
            (rs, i) ->
                new InvitationRow(
                    rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getObject(4, OffsetDateTime.class)))
        .list();
  }

  /** Whether a Member with this email (ignoring case) or an invitation for it exists. */
  public boolean memberOrInvited(WorkspaceScope s, String emailLower) {
    return db.sql(
            "SELECT EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id"
                + " WHERE m.workspace_id = ? AND u.email_lower = ?)"
                + " OR EXISTS (SELECT 1 FROM invitations WHERE workspace_id = ? AND email_lower = ?)")
        .params(s.workspaceId(), emailLower, s.workspaceId(), emailLower)
        .query(Boolean.class)
        .single();
  }

  public void addMember(WorkspaceScope s, UUID userId, String role) {
    db.sql("INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)").params(s.workspaceId(), userId, role).update();
  }

  public InvitationRow invite(WorkspaceScope s, String email, String role) {
    UUID id = UUID.randomUUID();
    return db.sql(
            "INSERT INTO invitations (id, workspace_id, email, email_lower, role) VALUES (?, ?, ?, lower(?), ?)"
                + " RETURNING id, email, role, created_at")
        .params(id, s.workspaceId(), email, email, role)
        .query(
            (rs, i) ->
                new InvitationRow(
                    rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getObject(4, OffsetDateTime.class)))
        .single();
  }

  public int owners(WorkspaceScope s) {
    return db.sql("SELECT count(*) FROM memberships WHERE workspace_id = ? AND role = 'OWNER'")
        .param(s.workspaceId())
        .query(Integer.class)
        .single();
  }

  public void changeRole(WorkspaceScope s, UUID userId, String role) {
    db.sql("UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?").params(role, s.workspaceId(), userId).update();
  }

  public void remove(WorkspaceScope s, UUID userId) {
    db.sql("DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?").params(s.workspaceId(), userId).update();
  }

  public boolean cancelInvitation(WorkspaceScope s, UUID id) {
    return db.sql("DELETE FROM invitations WHERE workspace_id = ? AND id = ?").params(s.workspaceId(), id).update() > 0;
  }
}
