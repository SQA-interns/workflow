package si.contacts.store;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.workspace.WorkspaceScope;

/** The normalised match keys of the active Contacts of a Workspace that share one with another. */
@Repository
public class DuplicateStore {
  private final JdbcClient db;

  public DuplicateStore(JdbcClient db) {
    this.db = db;
  }

  public record Key(UUID contactId, String kind, String value) {}

  /** Every (Contact, kind, value) whose value is shared by at least two active Contacts. */
  public List<Key> sharedKeys(WorkspaceScope s) {
    return db.sql(
            "WITH keys AS ("
                + " SELECT id, 'EMAIL' AS kind, email_norm AS value FROM contacts WHERE workspace_id = :ws AND NOT deleted AND email_norm IS NOT NULL"
                + " UNION ALL SELECT id, 'PHONE', phone_norm FROM contacts WHERE workspace_id = :ws AND NOT deleted AND phone_norm IS NOT NULL"
                + " UNION ALL SELECT id, 'NAME', name_norm FROM contacts WHERE workspace_id = :ws AND NOT deleted AND name_norm IS NOT NULL)"
                + " SELECT k.id, k.kind, k.value FROM keys k JOIN (SELECT kind, value FROM keys GROUP BY kind, value HAVING count(*) > 1) d"
                + " ON d.kind = k.kind AND d.value = k.value ORDER BY k.kind, k.value, k.id")
        .param("ws", s.workspaceId())
        .query((rs, i) -> new Key(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
        .list();
  }
}
