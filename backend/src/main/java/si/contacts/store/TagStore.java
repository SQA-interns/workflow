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

  public record TagCount(UUID id, String name, int count) {}

  /** Tags with the number of active Contacts carrying each, sorted by name. */
  public List<TagCount> counts(WorkspaceScope s) {
    return db.sql(
            "SELECT t.id, t.name, count(c.id) FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id = t.id"
                + " LEFT JOIN contacts c ON c.id = ct.contact_id AND NOT c.deleted"
                + " WHERE t.workspace_id = ? GROUP BY t.id, t.name ORDER BY t.name_lower, t.id")
        .param(s.workspaceId())
        .query((rs, i) -> new TagCount(rs.getObject(1, UUID.class), rs.getString(2), rs.getInt(3)))
        .list();
  }

  /** The Tag with this name ignoring case, locked for the rest of the transaction. */
  public java.util.Optional<Tag> findForUpdate(WorkspaceScope s, String name) {
    return db.sql("SELECT id, name FROM tags WHERE workspace_id = ? AND name_lower = ? FOR UPDATE")
        .params(s.workspaceId(), name.toLowerCase(Locale.ROOT))
        .query((rs, i) -> new Tag(rs.getObject(1, UUID.class), rs.getString(2)))
        .optional();
  }

  public java.util.Optional<Tag> find(WorkspaceScope s, String name) {
    return db.sql("SELECT id, name FROM tags WHERE workspace_id = ? AND name_lower = ?")
        .params(s.workspaceId(), name.toLowerCase(Locale.ROOT))
        .query((rs, i) -> new Tag(rs.getObject(1, UUID.class), rs.getString(2)))
        .optional();
  }

  /** Ids of every Contact (active or deleted) carrying the Tag, locked. */
  public List<UUID> contactsWith(WorkspaceScope s, UUID tagId) {
    return db.sql(
            "SELECT c.id FROM contacts c JOIN contact_tags ct ON ct.contact_id = c.id"
                + " WHERE c.workspace_id = ? AND ct.tag_id = ? ORDER BY c.id FOR UPDATE OF c")
        .params(s.workspaceId(), tagId)
        .query(UUID.class)
        .list();
  }

  public void rename(WorkspaceScope s, UUID tagId, String name) {
    db.sql("UPDATE tags SET name = ?, name_lower = ? WHERE workspace_id = ? AND id = ?")
        .params(name, name.toLowerCase(Locale.ROOT), s.workspaceId(), tagId)
        .update();
  }

  public void delete(WorkspaceScope s, UUID tagId) {
    db.sql("DELETE FROM tags WHERE workspace_id = ? AND id = ?").params(s.workspaceId(), tagId).update();
  }
}
