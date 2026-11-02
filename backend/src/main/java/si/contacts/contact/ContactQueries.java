package si.contacts.contact;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import si.contacts.store.ContactStore;
import si.contacts.store.ContactSearchStore;
import si.contacts.workspace.WorkspaceScope;

/** Read side of Contacts: list pages and the save-time duplicate warning. */
@Service
public class ContactQueries {
  private final ContactStore contacts;
  private final ContactSearchStore search;

  public ContactQueries(ContactStore contacts, ContactSearchStore search) {
    this.contacts = contacts;
    this.search = search;
  }

  public Map<String, Object> page(WorkspaceScope s, ContactQuery q) {
    List<UUID> ids = search.ids(s, q, q.page() * q.size(), q.size());
    long total = search.count(s, q);
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("items", contacts.load(s, ids).stream().map(Contact::toJson).toList());
    m.put("total", total);
    m.put("page", q.page());
    m.put("size", q.size());
    return m;
  }

  /** The Contact plus possible duplicates among the other active Contacts (never blocks a save). */
  public Map<String, Object> withDuplicates(WorkspaceScope s, Contact c) {
    Map<String, Object> m = c.toJson();
    m.put("possibleDuplicates", search.possibleDuplicates(s, c));
    return m;
  }
}
