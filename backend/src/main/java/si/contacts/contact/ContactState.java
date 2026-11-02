package si.contacts.contact;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The full state of a Contact: what every Revision holds. {@code fields} has every Predefined
 * field in order, absent values as null.
 */
public record ContactState(
    Map<String, String> fields, List<Attribute> attributes, List<String> tags, boolean deleted, UUID mergedInto) {

  public ContactState {
    Map<String, String> ordered = new LinkedHashMap<>();
    for (String f : Fields.PREDEFINED) ordered.put(f, fields.get(f));
    fields = Collections.unmodifiableMap(ordered);
    attributes = List.copyOf(attributes);
    tags = List.copyOf(tags);
  }

  public String field(String name) {
    return fields.get(name);
  }

  public ContactState withTags(List<String> newTags) {
    return new ContactState(fields, attributes, newTags, deleted, mergedInto);
  }

  public ContactState withDeleted(boolean d, UUID into) {
    return new ContactState(fields, attributes, tags, d, into);
  }

  /** The Predefined fields, Attributes and Tags as a JSON-ready map (Revision state shape). */
  public Map<String, Object> toMap() {
    Map<String, Object> m = new LinkedHashMap<>(fields);
    m.put("attributes", attributes.stream().map(a -> Map.of("key", a.key(), "value", a.value())).toList());
    m.put("tags", tags);
    m.put("deleted", deleted);
    m.put("mergedInto", mergedInto);
    return m;
  }

  @SuppressWarnings("unchecked")
  public static ContactState fromMap(Map<String, Object> m) {
    Map<String, String> f = new LinkedHashMap<>();
    for (String name : Fields.PREDEFINED) f.put(name, (String) m.get(name));
    List<Attribute> attrs =
        ((List<Map<String, Object>>) m.getOrDefault("attributes", List.of()))
            .stream().map(a -> new Attribute((String) a.get("key"), (String) a.get("value"))).toList();
    List<String> tags = (List<String>) m.getOrDefault("tags", List.of());
    Object into = m.get("mergedInto");
    return new ContactState(
        f, attrs, tags, Boolean.TRUE.equals(m.get("deleted")), into == null ? null : UUID.fromString(into.toString()));
  }
}
