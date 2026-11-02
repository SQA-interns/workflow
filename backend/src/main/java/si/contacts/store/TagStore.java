package si.contacts.store;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.store.ContactStore.Tag;
import si.contacts.workspace.WorkspaceScope;

/** Tags of one Workspace: created on first use, the same Tag regardless of letter case. */
@Repository
public class TagStore {
  private final JdbcClient db;

  public TagStore(JdbcClient db) {
    this.db = db;
  }

  /** The Tags for these names in order, creating missing ones; existing Tags keep their spelling. */
  public List<Tag> resolve(WorkspaceScope s, List<String> names) {
    List<Tag> out = new ArrayList<>();
    for (String name : names) {
      String lower = name.toLowerCase(Locale.ROOT);
      db.sql(
              "INSERT INTO tags (id, workspace_id, name, name_lower) VALUES (?, ?, ?, ?)"
                  + " ON CONFLICT (workspace_id, name_lower) DO NOTHING")
          .params(UUID.randomUUID(), s.workspaceId(), name, lower)
          .update();
      out.add(
          db.sql("SELECT id, name FROM tags WHERE workspace_id = ? AND name_lower = ?")
              .params(s.workspaceId(), lower)
              .query((rs, i) -> new Tag(rs.getObject(1, UUID.class), rs.getString(2)))
              .single());
    }
    return out;
  }
}
