package si.contacts.duplicate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactOrder;
import si.contacts.store.ContactStore;
import si.contacts.store.DuplicateStore;
import si.contacts.store.DuplicateStore.Key;
import si.contacts.user.User;
import si.contacts.workspace.WorkspaceAccess;
import si.contacts.workspace.WorkspaceScope;

/** US-010: Duplicate sets are active Contacts sharing a match key, grouped transitively. */
@RestController
public class DuplicateController {
  private final WorkspaceAccess access;
  private final DuplicateStore duplicates;
  private final ContactStore contacts;

  public DuplicateController(WorkspaceAccess access, DuplicateStore duplicates, ContactStore contacts) {
    this.access = access;
    this.duplicates = duplicates;
    this.contacts = contacts;
  }

  /** One normalised value shared by several Contacts. */
  record Match(String kind, String value, List<UUID> contactIds) {}

  record DuplicateSet(List<Contact> contacts, List<Match> matches) {}

  @GetMapping("/api/workspaces/{wid}/duplicate-sets")
  List<Map<String, Object>> sets(User user, @PathVariable UUID wid) {
    WorkspaceScope s = access.open(wid, user);
    return group(duplicates.sharedKeys(s), ids -> contacts.load(s, ids)).stream().map(DuplicateController::view).toList();
  }

  /** Groups the shared keys transitively (union-find); sets and their Contacts in the list's default order. */
  static List<DuplicateSet> group(List<Key> keys, java.util.function.Function<List<UUID>, List<Contact>> load) {
    Map<String, Match> matches = new LinkedHashMap<>();
    for (Key k : keys)
      matches.computeIfAbsent(k.kind() + "\u0000" + k.value(), x -> new Match(k.kind(), k.value(), new ArrayList<>())).contactIds().add(k.contactId());
    Map<UUID, UUID> parent = new HashMap<>();
    for (Match m : matches.values()) for (UUID id : m.contactIds()) union(parent, m.contactIds().get(0), id);
    Map<UUID, List<UUID>> members = new LinkedHashMap<>();
    for (UUID id : parent.keySet()) members.computeIfAbsent(find(parent, id), x -> new ArrayList<>()).add(id);
    List<DuplicateSet> out = new ArrayList<>();
    for (Map.Entry<UUID, List<UUID>> e : members.entrySet()) {
      List<Contact> loaded = new ArrayList<>(load.apply(e.getValue()));
      loaded.sort(ContactOrder.DEFAULT);
      List<Match> own = matches.values().stream().filter(m -> find(parent, m.contactIds().get(0)).equals(e.getKey())).toList();
      out.add(new DuplicateSet(loaded, own));
    }
    out.sort(Comparator.comparing((DuplicateSet d) -> d.contacts().get(0), ContactOrder.DEFAULT));
    return out;
  }

  static Map<String, Object> view(DuplicateSet d) {
    Map<String, Object> set = new LinkedHashMap<>();
    set.put("contacts", d.contacts().stream().map(Contact::toJson).toList());
    set.put("matches", d.matches().stream().map(m -> {
      Map<String, Object> v = new LinkedHashMap<>();
      v.put("contactIds", m.contactIds());
      v.put("kind", m.kind());
      v.put("value", m.value());
      return v;
    }).toList());
    return set;
  }

  private static UUID find(Map<UUID, UUID> parent, UUID x) {
    parent.putIfAbsent(x, x);
    UUID p = parent.get(x);
    if (p.equals(x)) return x;
    UUID root = find(parent, p);
    parent.put(x, root);
    return root;
  }

  private static void union(Map<UUID, UUID> parent, UUID a, UUID b) {
    UUID ra = find(parent, a);
    UUID rb = find(parent, b);
    if (!ra.equals(rb)) parent.put(rb, ra);
  }
}
