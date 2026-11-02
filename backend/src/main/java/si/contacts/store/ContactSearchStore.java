package si.contacts.store;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactQuery;
import si.contacts.contact.Normalize;
import si.contacts.workspace.WorkspaceScope;

/** Search, filter, sort and paging of Contacts, evaluated entirely in PostgreSQL (AR-10). */
@Repository
public class ContactSearchStore {
  private final JdbcClient db;

  public ContactSearchStore(JdbcClient db) {
    this.db = db;
  }

  private record Where(String sql, Map<String, Object> params) {}

  private static Where where(WorkspaceScope s, ContactQuery q) {
    StringBuilder w = new StringBuilder("c.workspace_id = :ws AND c.deleted = :deleted");
    Map<String, Object> p = new LinkedHashMap<>();
    p.put("ws", s.workspaceId());
    p.put("deleted", q.deleted());
    if (q.q() != null) {
      String norm = Normalize.text(q.q());
      if (!norm.isEmpty()) {
        w.append(" AND c.search_text LIKE :q ESCAPE '\\'");
        p.put("q", "%" + Normalize.likeEscape(norm) + "%");
      }
    }
    if (!q.tags().isEmpty()) {
      List<String> lower = q.tags().stream().map(t -> t.toLowerCase(Locale.ROOT)).toList();
      if (q.tagModeAny()) {
        w.append(
            " AND EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id"
                + " WHERE ct.contact_id = c.id AND t.name_lower IN (:tagsAny))");
        p.put("tagsAny", lower);
      } else {
        for (int i = 0; i < lower.size(); i++) {
          w.append(
              " AND EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id"
                  + " WHERE ct.contact_id = c.id AND t.name_lower = :tag" + i + ")");
          p.put("tag" + i, lower.get(i));
        }
      }
    }
    for (int i = 0; i < q.attrs().size(); i++) {
      String a = q.attrs().get(i);
      int eq = a.indexOf('=');
      String key = (eq < 0 ? a : a.substring(0, eq)).strip().toLowerCase(Locale.ROOT);
      w.append(" AND EXISTS (SELECT 1 FROM contact_attributes a WHERE a.contact_id = c.id AND a.key_lower = :ak").append(i);
      p.put("ak" + i, key);
      if (eq >= 0) {
        w.append(" AND lower(a.value) = lower(:av").append(i).append(")");
        p.put("av" + i, a.substring(eq + 1).strip());
      }
      w.append(")");
    }
    if (q.country() != null) {
      w.append(" AND c.country = :country");
      p.put("country", q.country());
    }
    if (q.company() != null) {
      w.append(" AND lower(c.company) = lower(:company)");
      p.put("company", q.company());
    }
    return new Where(w.toString(), p);
  }

  static String orderBy(ContactQuery q) {
    String dir = q.descending() ? "DESC" : "ASC";
    String nulls = q.descending() ? "NULLS LAST" : "NULLS LAST";
    return switch (q.sort()) {
      case "firstName" -> "c.sort_first " + dir + " " + nulls + ", c.sort_last " + dir + " " + nulls + ", c.id";
      case "company" -> "c.sort_company " + dir + " " + nulls + ", c.sort_last " + dir + " " + nulls + ", c.id";
      case "updatedAt" -> "c.updated_at " + dir + ", c.id";
      default -> "c.sort_last " + dir + " " + nulls + ", c.sort_first " + dir + " " + nulls + ", c.id";
    };
  }

  public List<UUID> ids(WorkspaceScope s, ContactQuery q, int offset, int limit) {
    Where w = where(s, q);
    return db.sql("SELECT c.id FROM contacts c WHERE " + w.sql() + " ORDER BY " + orderBy(q) + " LIMIT :limit OFFSET :offset")
        .params(w.params())
        .param("limit", limit)
        .param("offset", offset)
        .query(UUID.class)
        .list();
  }

  public long count(WorkspaceScope s, ContactQuery q) {
    Where w = where(s, q);
    return db.sql("SELECT count(*) FROM contacts c WHERE " + w.sql()).params(w.params()).query(Long.class).single();
  }

  /** Active Contacts (other than {@code c}) sharing its normalised email, phone or full name. */
  public List<Map<String, Object>> possibleDuplicates(WorkspaceScope s, Contact c) {
    if (c.state().deleted()) return List.of();
    String email = Normalize.email(c.state().field("email"));
    String phone = Normalize.phone(c.state().field("phone"));
    String name = Normalize.fullName(c.state().field("firstName"), c.state().field("lastName"));
    if (email == null && phone == null && name == null) return List.of();
    List<Map<String, Object>> out = new ArrayList<>();
    db.sql(
            "SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.email_norm = :email AS m_email,"
                + " c.phone_norm = :phone AS m_phone, c.name_norm = :name AS m_name FROM contacts c"
                + " WHERE c.workspace_id = :ws AND NOT c.deleted AND c.id <> :id"
                + " AND (c.email_norm = :email OR c.phone_norm = :phone OR c.name_norm = :name)"
                + " ORDER BY c.sort_last NULLS LAST, c.sort_first NULLS LAST, c.id")
        .param("ws", s.workspaceId())
        .param("id", c.id())
        .param("email", email)
        .param("phone", phone)
        .param("name", name)
        .query(
            rs -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("id", rs.getObject("id", UUID.class));
              m.put("firstName", rs.getString("first_name"));
              m.put("lastName", rs.getString("last_name"));
              m.put("email", rs.getString("email"));
              m.put("phone", rs.getString("phone"));
              List<String> kinds = new ArrayList<>();
              if (rs.getBoolean("m_email")) kinds.add("EMAIL");
              if (rs.getBoolean("m_phone")) kinds.add("PHONE");
              if (rs.getBoolean("m_name")) kinds.add("NAME");
              m.put("matchKinds", kinds);
              out.add(m);
            });
    return out;
  }
}
