package si.contacts.merge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import si.contacts.contact.Attribute;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactState;
import si.contacts.web.ApiException;

class MergeRulesTest {
  static Contact c(String first, String email, List<Attribute> attrs, List<String> tags) {
    Map<String, String> f = new HashMap<>();
    f.put("firstName", first);
    f.put("email", email);
    return new Contact(UUID.randomUUID(), 1, new ContactState(f, attrs, tags, false, null), null, null);
  }

  static Map<UUID, Contact> byId(Contact... cs) {
    Map<UUID, Contact> m = new HashMap<>();
    for (Contact x : cs) m.put(x.id(), x);
    return m;
  }

  static String field(ApiException e) {
    return e.errors().get(0).field();
  }

  @Test
  void twoToTenContactsEachWithIdAndVersion() {
    Map<String, Object> ref = Map.of("id", UUID.randomUUID().toString(), "version", 1);
    assertThat(MergeController.refs(List.of(ref, ref))).hasSize(2);
    assertThat(MergeController.refs(java.util.Collections.nCopies(10, ref))).hasSize(10);
    assertThatThrownBy(() -> MergeController.refs(List.of(ref))).isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("contacts"));
    assertThatThrownBy(() -> MergeController.refs(java.util.Collections.nCopies(11, ref))).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> MergeController.refs("x")).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> MergeController.refs(List.of(ref, "x")))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("contacts[1]"));
    assertThatThrownBy(() -> MergeController.refs(List.of(ref, Map.of("id", "nope", "version", 1))))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("contacts[1].id"));
    assertThatThrownBy(() -> MergeController.refs(List.of(ref, Map.of("id", UUID.randomUUID().toString(), "version", "1"))))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("contacts[1].version"));
  }

  @Test
  void sourcesMustBeListedContacts() {
    UUID a = UUID.randomUUID();
    assertThat(MergeController.sources(null, "fieldSources", Set.of(a))).isEmpty();
    assertThat(MergeController.sources(Map.of("email", a.toString()), "fieldSources", Set.of(a))).containsEntry("email", a);
    assertThatThrownBy(() -> MergeController.sources("x", "fieldSources", Set.of(a)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("fieldSources"));
    assertThatThrownBy(() -> MergeController.sources(Map.of("email", UUID.randomUUID().toString()), "fieldSources", Set.of(a)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("fieldSources.email"));
  }

  @Test
  void theMergeNeedsANameOrEmailAndAChosenAttributeSourceMustHaveTheKey() {
    Contact s = c("Ana", null, List.of(new Attribute("k", "1")), List.of());
    Contact o = c(null, null, List.of(), List.of());
    assertThatThrownBy(() -> MergeController.mergedState(s, List.of(s, o), Map.of("firstName", o.id()), Map.of(), byId(s, o)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("fieldSources"));
    assertThatThrownBy(() -> MergeController.mergedState(s, List.of(s, o), Map.of(), Map.of("k", o.id()), byId(s, o)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("attributeSources.k"));
    Contact emailOnly = c(null, "a@b.si", List.of(), List.of());
    assertThat(MergeController.mergedState(emailOnly, List.of(emailOnly, o), Map.of(), Map.of(), byId(emailOnly, o)).field("email"))
        .isEqualTo("a@b.si");
  }

  @Test
  void theCombinedAttributesAndTagsStayWithinTheContactLimits() {
    List<Attribute> fifty = new ArrayList<>();
    List<Attribute> fiftyOther = new ArrayList<>();
    List<Attribute> fiftyOneOther = new ArrayList<>();
    for (int i = 0; i < 50; i++) fifty.add(new Attribute("a" + i, "v"));
    for (int i = 0; i < 50; i++) fiftyOther.add(new Attribute("b" + i, "v"));
    for (int i = 0; i < 51; i++) fiftyOneOther.add(new Attribute("b" + i, "v"));
    Contact s = c("Ana", null, fifty, List.of());
    Contact ok = c("B", null, fiftyOther, List.of());
    assertThat(MergeController.mergedState(s, List.of(s, ok), Map.of(), Map.of(), byId(s, ok)).attributes()).hasSize(100);
    Contact over = c("B", null, fiftyOneOther, List.of());
    assertThatThrownBy(() -> MergeController.mergedState(s, List.of(s, over), Map.of(), Map.of(), byId(s, over)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("attributes"));

    List<String> t25 = new ArrayList<>();
    List<String> u25 = new ArrayList<>();
    List<String> u26 = new ArrayList<>();
    for (int i = 0; i < 25; i++) t25.add("t" + i);
    for (int i = 0; i < 25; i++) u25.add("u" + i);
    for (int i = 0; i < 26; i++) u26.add("u" + i);
    Contact ts = c("Ana", null, List.of(), t25);
    Contact tok = c("B", null, List.of(), u25);
    assertThat(MergeController.mergedState(ts, List.of(ts, tok), Map.of(), Map.of(), byId(ts, tok)).tags()).hasSize(50);
    Contact tover = c("B", null, List.of(), u26);
    assertThatThrownBy(() -> MergeController.mergedState(ts, List.of(ts, tover), Map.of(), Map.of(), byId(ts, tover)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(field(e)).isEqualTo("tags"));
  }
}
