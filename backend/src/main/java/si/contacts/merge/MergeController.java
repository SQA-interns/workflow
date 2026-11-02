package si.contacts.merge;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.contact.Attribute;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactService;
import si.contacts.contact.ContactState;
import si.contacts.contact.Fields;
import si.contacts.store.ContactStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.workspace.Role;
import si.contacts.workspace.WorkspaceAccess;
import si.contacts.workspace.WorkspaceScope;

/**
 * US-011: merges 2–10 active Contacts into the Survivor. All affected Contacts change in one
 * transaction, each with one Revision, or nothing changes.
 */
@RestController
public class MergeController {
  static final int MIN = 2;
  static final int MAX = 10;
  private final WorkspaceAccess access;
  private final ContactStore contacts;
  private final ContactService service;

  public MergeController(WorkspaceAccess access, ContactStore contacts, ContactService service) {
    this.access = access;
    this.contacts = contacts;
    this.service = service;
  }

  record Ref(UUID id, int version) {}

  @PostMapping("/api/workspaces/{wid}/merge")
  @Transactional
  Map<String, Object> merge(User user, @PathVariable UUID wid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(Role.EDITOR);
    UUID survivorId = uuid(body.get("survivorId"), "survivorId");
    List<Ref> refs = refs(body.get("contacts"));
    Set<UUID> listed = new HashSet<>();
    for (Ref r : refs) if (!listed.add(r.id())) throw ApiException.badRequest("contacts", "repeated contact");
    if (!listed.contains(survivorId)) throw ApiException.badRequest("survivorId", "survivor must be listed");
    Map<String, UUID> fieldSources = sources(body.get("fieldSources"), "fieldSources", listed);
    for (String f : fieldSources.keySet())
      if (!Fields.PREDEFINED.contains(f)) throw ApiException.badRequest("fieldSources." + f, "unknown field");
    Map<String, UUID> attributeSources = sources(body.get("attributeSources"), "attributeSources", listed);

    // Lock in a fixed order to avoid deadlocks between concurrent merges.
    Map<UUID, Contact> byId = new HashMap<>();
    listed.stream().sorted().forEach(id -> {
      Contact c = contacts.findForUpdate(s, id).orElseThrow(() -> ApiException.badRequest("contacts", "invalid selection"));
      byId.put(id, c);
    });
    for (Ref r : refs) if (byId.get(r.id()).state().deleted()) throw ApiException.badRequest("contacts", "contact is deleted");
    for (Ref r : refs) if (byId.get(r.id()).version() != r.version()) throw ApiException.outdatedVersion();

    List<Contact> ordered = refs.stream().map(r -> byId.get(r.id())).toList();
    Contact survivor = byId.get(survivorId);
    ContactState merged = combine(survivor, ordered, fieldSources, attributeSources, byId);

    Contact result = service.write(s, survivor, survivor.version(), merged, "MERGE");
    for (Contact c : ordered) {
      if (c.id().equals(survivorId)) continue;
      service.write(s, c, c.version(), c.state().withDeleted(true, survivorId), "MERGED_AWAY");
    }
    return result.toJson();
  }

  static ContactState combine(
      Contact survivor,
      List<Contact> ordered,
      Map<String, UUID> fieldSources,
      Map<String, UUID> attributeSources,
      Map<UUID, Contact> byId) {
    Map<String, String> fields = new LinkedHashMap<>();
    for (String f : Fields.PREDEFINED) {
      UUID source = fieldSources.get(f);
      String value;
      if (source != null) value = byId.get(source).state().field(f);
      else {
        value = survivor.state().field(f);
        if (value == null)
          value = ordered.stream().map(c -> c.state().field(f)).filter(v -> v != null).findFirst().orElse(null);
      }
      fields.put(f, value);
    }
    if (fields.get("firstName") == null && fields.get("lastName") == null && fields.get("email") == null)
      throw ApiException.badRequest("fieldSources", "first name, last name or email is required");

    // Attributes: Survivor's first, then new keys in list order; the Survivor's value wins unless chosen.
    Map<String, Attribute> attrs = new LinkedHashMap<>();
    List<Contact> survivorFirst = new ArrayList<>();
    survivorFirst.add(survivor);
    ordered.stream().filter(c -> !c.id().equals(survivor.id())).forEach(survivorFirst::add);
    for (Contact c : survivorFirst)
      for (Attribute a : c.state().attributes()) attrs.putIfAbsent(a.key().toLowerCase(Locale.ROOT), a);
    for (Map.Entry<String, UUID> e : attributeSources.entrySet()) {
      String lower = e.getKey().toLowerCase(Locale.ROOT);
      Attribute existing = attrs.get(lower);
      Attribute fromSource =
          byId.get(e.getValue()).state().attributes().stream()
              .filter(a -> a.key().equalsIgnoreCase(e.getKey()))
              .findFirst()
              .orElseThrow(() -> ApiException.badRequest("attributeSources." + e.getKey(), "source has no such attribute"));
      attrs.put(lower, new Attribute(existing.key(), fromSource.value()));
    }
    if (attrs.size() > 100) throw ApiException.badRequest("attributes", "too many attributes");

    Map<String, String> tags = new LinkedHashMap<>();
    for (Contact c : survivorFirst) for (String t : c.state().tags()) tags.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
    if (tags.size() > 50) throw ApiException.badRequest("tags", "too many tags");

    return new ContactState(fields, new ArrayList<>(attrs.values()), new ArrayList<>(tags.values()), false, null);
  }

  static List<Ref> refs(Object raw) {
    if (!(raw instanceof List<?> list)) throw ApiException.badRequest("contacts", "required");
    if (list.size() < MIN || list.size() > MAX) throw ApiException.badRequest("contacts", "between " + MIN + " and " + MAX + " contacts");
    List<Ref> out = new ArrayList<>();
    for (int i = 0; i < list.size(); i++) {
      if (!(list.get(i) instanceof Map<?, ?> m)) throw ApiException.badRequest("contacts[" + i + "]", "must be an object");
      UUID id = uuid(m.get("id"), "contacts[" + i + "].id");
      if (!(m.get("version") instanceof Integer v)) throw ApiException.badRequest("contacts[" + i + "].version", "required");
      out.add(new Ref(id, v));
    }
    return out;
  }

  static Map<String, UUID> sources(Object raw, String field, Set<UUID> listed) {
    Map<String, UUID> out = new LinkedHashMap<>();
    if (raw == null) return out;
    if (!(raw instanceof Map<?, ?> m)) throw ApiException.badRequest(field, "must be an object");
    for (Map.Entry<?, ?> e : m.entrySet()) {
      String key = String.valueOf(e.getKey());
      UUID id = uuid(e.getValue(), field + "." + key);
      if (!listed.contains(id)) throw ApiException.badRequest(field + "." + key, "source must be listed");
      out.put(key, id);
    }
    return out;
  }

  static UUID uuid(Object raw, String field) {
    if (raw instanceof String s) {
      try {
        return UUID.fromString(s);
      } catch (IllegalArgumentException e) {
        // fall through
      }
    }
    throw ApiException.badRequest(field, "required");
  }
}
