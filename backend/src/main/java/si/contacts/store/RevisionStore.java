package si.contacts.store;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.workspace.WorkspaceScope;

/** Immutable Revisions: append and read only. */
@Repository
public class RevisionStore {
  private final JdbcClient db;

  public RevisionStore(JdbcClient db) {
    this.db = db;
  }

  public record RevisionRow(
      int number, String type, UUID authorId, String authorEmail, String authorName, OffsetDateTime createdAt, String stateJson) {}

  public void append(WorkspaceScope s, UUID contactId, int number, String type, String stateJson) {
    db.sql(
            "INSERT INTO revisions (contact_id, workspace_id, number, type, author_id, state)"
                + " VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb))")
        .params(contactId, s.workspaceId(), number, type, s.user().id(), stateJson)
        .update();
  }

  public List<RevisionRow> list(WorkspaceScope s, UUID contactId) {
    return db.sql(
            "SELECT r.number, r.type, u.id, u.email, u.display_name, r.created_at, r.state::text FROM revisions r"
                + " JOIN users u ON u.id = r.author_id WHERE r.workspace_id = ? AND r.contact_id = ?"
                + " ORDER BY r.number DESC")
        .params(s.workspaceId(), contactId)
        .query(RevisionStore::row)
        .list();
  }

  public Optional<RevisionRow> find(WorkspaceScope s, UUID contactId, int number) {
    return db.sql(
            "SELECT r.number, r.type, u.id, u.email, u.display_name, r.created_at, r.state::text FROM revisions r"
                + " JOIN users u ON u.id = r.author_id WHERE r.workspace_id = ? AND r.contact_id = ? AND r.number = ?")
        .params(s.workspaceId(), contactId, number)
        .query(RevisionStore::row)
        .optional();
  }

  static RevisionRow row(ResultSet rs, int i) throws SQLException {
    return new RevisionRow(
        rs.getInt(1),
        rs.getString(2),
        rs.getObject(3, UUID.class),
        rs.getString(4),
        rs.getString(5),
        rs.getObject(6, OffsetDateTime.class),
        rs.getString(7));
  }
}
