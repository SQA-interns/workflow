package si.contacts.contact;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** A Contact as stored now; its version is the number of its latest Revision. */
public record Contact(UUID id, int version, ContactState state, OffsetDateTime createdAt, OffsetDateTime updatedAt) {

  public Map<String, Object> toJson() {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", id);
    m.put("version", version);
    m.put("deleted", state.deleted());
    m.put("mergedInto", state.mergedInto());
    m.putAll(state.fields());
    m.put("attributes", state.attributes().stream().map(a -> Map.of("key", a.key(), "value", a.value())).toList());
    m.put("tags", state.tags());
    m.put("createdAt", createdAt);
    m.put("updatedAt", updatedAt);
    return m;
  }
}
