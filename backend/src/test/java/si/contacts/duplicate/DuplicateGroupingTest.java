package si.contacts.duplicate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactState;
import si.contacts.store.DuplicateStore.Key;

class DuplicateGroupingTest {
  static Contact c(String id, String first, String last) {
    Map<String, String> f = new HashMap<>();
    f.put("firstName", first);
    f.put("lastName", last);
    return new Contact(UUID.fromString("00000000-0000-0000-0000-00000000000" + id), 1, new ContactState(f, List.of(), List.of(), false, null), null, null);
  }

  @Test
  void setsAreTransitiveAndSortedByTheirFirstContactInListOrder() {
    Contact a = c("1", "Ana", "Zupan"), b = c("2", "Bor", "Avsec"), d = c("3", "Cene", "Kos"), e = c("4", "Dan", "Kos"), f = c("5", "Eva", null);
    Map<UUID, Contact> all = Map.of(a.id(), a, b.id(), b, d.id(), d, e.id(), e, f.id(), f);
    List<Key> keys = List.of(
        new Key(d.id(), "EMAIL", "k@x.si"), new Key(e.id(), "EMAIL", "k@x.si"),
        new Key(a.id(), "PHONE", "+1234567"), new Key(b.id(), "PHONE", "+1234567"),
        new Key(b.id(), "NAME", "bor avsec"), new Key(f.id(), "NAME", "bor avsec"));
    var sets = DuplicateController.group(keys, ids -> ids.stream().map(all::get).toList());
    assertThat(sets).hasSize(2);
    assertThat(sets.get(0).contacts()).containsExactly(b, a, f);
    assertThat(sets.get(0).matches()).extracting(DuplicateController.Match::kind).containsExactly("PHONE", "NAME");
    assertThat(sets.get(1).contacts()).containsExactly(d, e);
    assertThat(sets.get(1).matches().get(0).contactIds()).containsExactly(d.id(), e.id());
    var view = DuplicateController.view(sets.get(1));
    assertThat(view).containsOnlyKeys("contacts", "matches");
    assertThat((List<?>) view.get("matches")).hasSize(1);
    assertThat(DuplicateController.group(List.of(), ids -> List.of())).isEmpty();
  }
}
