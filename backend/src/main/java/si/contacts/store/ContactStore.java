package si.contacts.store;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.contact.Attribute;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactState;
import si.contacts.contact.Fields;
import si.contacts.contact.Normalize;
import si.contacts.workspace.WorkspaceScope;

/** Contacts of one Workspace with their Attributes and Tags. */
@Repository
public class ContactStore {
  static final String COLUMNS =
      "c.id, c.version, c.deleted, c.merged_into, c.first_name, c.last_name, c.email, c.phone, c.company,"
          + " c.job_title, c.street, c.postal_code, c.city, c.country, c.note, c.created_at, c.updated_at";
  private final JdbcClient db;

  public ContactStore(JdbcClient db) {
    this.db = db;
  }

  public record Tag(UUID id, String name) {}

  public void insert(WorkspaceScope s, UUID id, ContactState st, List<Tag> tags) {
    Map<String, Object> p = params(st);
    p.put("id", id);
    p.put("ws", s.workspaceId());
    db.sql(
            "INSERT INTO contacts (id, workspace_id, version, deleted, merged_into, first_name, last_name, email, phone,"
                + " company, job_title, street, postal_code, city, country, note, search_text, email_norm, phone_norm,"
                + " name_norm, sort_last, sort_first, sort_company) VALUES (:id, :ws, 1, :deleted, :mergedInto,"
                + " :firstName, :lastName, :email, :phone, :company, :jobTitle, :street, :postalCode, :city, :country,"
                + " :note, :searchText, :emailNorm, :phoneNorm, :nameNorm, :sortLast, :sortFirst, :sortCompany)")
        .params(p)
        .update();
    writeChildren(id, st, tags);
  }

  /**
   * Writes the new state if the Contact is still at {@code expectedVersion}; returns the new
   * version, or empty when the version was outdated.
   */
  public Optional<Integer> update(WorkspaceScope s, UUID id, int expectedVersion, ContactState st, List<Tag> tags) {
    Map<String, Object> p = params(st);
    p.put("id", id);
    p.put("ws", s.workspaceId());
    p.put("expected", expectedVersion);
    Optional<Integer> version =
        db.sql(
                "UPDATE contacts SET version = version + 1, updated_at = now(), deleted = :deleted,"
                    + " merged_into = :mergedInto, first_name = :firstName, last_name = :lastName, email = :email,"
                    + " phone = :phone, company = :company, job_title = :jobTitle, street = :street,"
                    + " postal_code = :postalCode, city = :city, country = :country, note = :note,"
                    + " search_text = :searchText, email_norm = :emailNorm, phone_norm = :phoneNorm,"
                    + " name_norm = :nameNorm, sort_last = :sortLast, sort_first = :sortFirst,"
                    + " sort_company = :sortCompany"
                    + " WHERE id = :id AND workspace_id = :ws AND version = :expected RETURNING version")
            .params(p)
            .query(Integer.class)
            .optional();
    if (version.isPresent()) {
      db.sql("DELETE FROM contact_attributes WHERE contact_id = ?").param(id).update();
      db.sql("DELETE FROM contact_tags WHERE contact_id = ?").param(id).update();
      writeChildren(id, st, tags);
    }
    return version;
  }

  private void writeChildren(UUID id, ContactState st, List<Tag> tags) {
    for (int i = 0; i < st.attributes().size(); i++) {
      Attribute a = st.attributes().get(i);
      db.sql("INSERT INTO contact_attributes (contact_id, position, key, key_lower, value) VALUES (?, ?, ?, ?, ?)")
          .params(id, i, a.key(), a.key().toLowerCase(Locale.ROOT), a.value())
          .update();
    }
    for (int i = 0; i < tags.size(); i++) {
      db.sql("INSERT INTO contact_tags (contact_id, tag_id, position) VALUES (?, ?, ?)").params(id, tags.get(i).id(), i).update();
    }
  }

  private static Map<String, Object> params(ContactState st) {
    Map<String, Object> p = new HashMap<>();
    st.fields().forEach(p::put);
    p.put("deleted", st.deleted());
    p.put("mergedInto", st.mergedInto());
    p.put("searchText", Normalize.searchText(st));
    p.put("emailNorm", Normalize.email(st.field("email")));
    p.put("phoneNorm", Normalize.phone(st.field("phone")));
    p.put("nameNorm", Normalize.fullName(st.field("firstName"), st.field("lastName")));
    p.put("sortLast", Normalize.text(st.field("lastName")));
    p.put("sortFirst", Normalize.text(st.field("firstName")));
    p.put("sortCompany", Normalize.text(st.field("company")));
    return p;
  }

  public Optional<Contact> find(WorkspaceScope s, UUID id) {
    return load(s, List.of(id)).stream().findFirst();
  }

  /** Locks the Contact row for the rest of the transaction. */
  public Optional<Contact> findForUpdate(WorkspaceScope s, UUID id) {
    boolean exists =
        db.sql("SELECT id FROM contacts WHERE id = ? AND workspace_id = ? FOR UPDATE")
            .params(id, s.workspaceId())
            .query(UUID.class)
            .optional()
            .isPresent();
    return exists ? find(s, id) : Optional.empty();
  }

  /** The Contacts with these ids in this Workspace, in the order of {@code ids}. */
  public List<Contact> load(WorkspaceScope s, List<UUID> ids) {
    if (ids.isEmpty()) return List.of();
    UUID[] arr = ids.toArray(UUID[]::new);
    List<Row> rows =
        db.sql("SELECT " + COLUMNS + " FROM contacts c WHERE c.workspace_id = ? AND c.id = ANY(?)")
            .params(s.workspaceId(), arr)
            .query(ContactStore::row)
            .list();
    Map<UUID, List<Attribute>> attrs = new HashMap<>();
    db.sql(
            "SELECT a.contact_id, a.key, a.value FROM contact_attributes a JOIN contacts c ON c.id = a.contact_id"
                + " WHERE c.workspace_id = ? AND a.contact_id = ANY(?) ORDER BY a.contact_id, a.position")
        .params(s.workspaceId(), arr)
        .query(
            rs -> {
              attrs.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(new Attribute(rs.getString(2), rs.getString(3)));
            });
    Map<UUID, List<String>> tags = new HashMap<>();
    db.sql(
            "SELECT ct.contact_id, t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id"
                + " WHERE t.workspace_id = ? AND ct.contact_id = ANY(?) ORDER BY ct.contact_id, ct.position")
        .params(s.workspaceId(), arr)
        .query(rs -> {
          tags.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(rs.getString(2));
        });
    Map<UUID, Contact> byId = new LinkedHashMap<>();
    for (Row r : rows) {
      ContactState st =
          new ContactState(
              r.fields, attrs.getOrDefault(r.id, List.of()), tags.getOrDefault(r.id, List.of()), r.deleted, r.mergedInto);
      byId.put(r.id, new Contact(r.id, r.version, st, r.createdAt, r.updatedAt));
    }
    return ids.stream().map(byId::get).filter(java.util.Objects::nonNull).collect(Collectors.toList());
  }

  public void purge(WorkspaceScope s, UUID id) {
    db.sql("DELETE FROM contacts WHERE id = ? AND workspace_id = ?").params(id, s.workspaceId()).update();
  }

  record Row(
      UUID id, int version, boolean deleted, UUID mergedInto, Map<String, String> fields, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

  static Row row(ResultSet rs, int i) throws SQLException {
    Map<String, String> f = new LinkedHashMap<>();
    for (String name : Fields.PREDEFINED) f.put(name, rs.getString(Fields.COLUMN.get(name)));
    return new Row(
        rs.getObject("id", UUID.class),
        rs.getInt("version"),
        rs.getBoolean("deleted"),
        rs.getObject("merged_into", UUID.class),
        f,
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class));
  }
}
