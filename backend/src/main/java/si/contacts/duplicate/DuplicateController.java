package si.contacts.duplicate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.contact.Contact;
import si.contacts.contact.Normalize;
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

  @GetMapping("/api/workspaces/{wid}/duplicate-sets")
  List<Map<String, Object>> sets(User user, @PathVariable UUID wid) {
    WorkspaceScope s = access.open(wid, user);
    List<Key> keys = duplicates.sharedKeys(s);
    Map<String, List<UUID>> byValue = new LinkedHashMap<>();
    for (Key k : keys) byValue.computeIfAbsent(k.kind() + "\u0000" + k.value(), x -> new ArrayList<>()).add(k.contactId());

    Map<UUID, UUID> parent = new HashMap<>();
    for (List<UUID> group : byValue.values()) for (UUID id : group) union(parent, group.get(0), id);

    Map<UUID, List<UUID>> members = new LinkedHashMap<>();
    for (UUID id : parent.keySet()) members.computeIfAbsent(find(parent, id), x -> new ArrayList<>()).add(id);

    List<Map<String, Object>> out = new ArrayList<>();
    for (List<UUID> ids : members.values()) {
      List<Contact> loaded = new ArrayList<>(contacts.load(s, ids));
      loaded.sort(ORDER);
      UUID root = find(parent, ids.get(0));
      List<Map<String, Object>> matches = new ArrayList<>();
      byValue.forEach(
          (kv, group) -> {
            if (!find(parent, group.get(0)).equals(root)) return;
            String[] parts = kv.split("\u0000", 2);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("contactIds", group);
            m.put("kind", parts[0]);
            m.put("value", parts[1]);
            matches.add(m);
          });
      Map<String, Object> set = new LinkedHashMap<>();
      set.put("contacts", loaded.stream().map(Contact::toJson).toList());
      set.put("matches", matches);
      out.add(set);
    }
    out.sort(Comparator.comparing(m -> sortKey(m)));
    return out;
  }

  static final Comparator<Contact> ORDER =
      Comparator.comparing((Contact c) -> Objects.toString(Normalize.text(c.state().field("lastName")), "￿"))
          .thenComparing(c -> Objects.toString(Normalize.text(c.state().field("firstName")), "￿"))
          .thenComparing(c -> c.id().toString());

  @SuppressWarnings("unchecked")
  static String sortKey(Map<String, Object> set) {
    Map<String, Object> first = ((List<Map<String, Object>>) set.get("contacts")).get(0);
    return Objects.toString(Normalize.text((String) first.get("lastName")), "￿")
        + "\u0000" + Objects.toString(Normalize.text((String) first.get("firstName")), "￿")
        + "\u0000" + first.get("id");
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
