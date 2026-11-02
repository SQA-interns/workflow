package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-010: Duplicate detection and the save-time warning. */
class DuplicateApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Dvojniki");
    contacts = "/api/workspaces/" + w + "/contacts";
  }

  String add(Object... kv) {
    return createContact(owner, w, contact(kv)).get("id").asText();
  }

  List<Set<String>> sets() {
    Api.Res r = api.get(owner.token(), "/api/workspaces/" + w + "/duplicate-sets");
    assertThat(r.status()).isEqualTo(200);
    return r.json().valueStream()
        .map(s -> s.get("contacts").valueStream().map(c -> c.get("id").asText()).collect(Collectors.toSet()))
        .toList();
  }

  @Test
  void AC_010_01_emailsMatchIgnoringLetterCase() {
    String a = add("firstName", "A", "email", "Ana.Kos@Example.si");
    String b = add("firstName", "B", "email", "ana.kos@example.SI");
    add("firstName", "C", "email", "druga@example.si");
    assertThat(sets()).containsExactly(Set.of(a, b));
  }

  @Test
  void AC_010_02_phonesMatchIgnoringFormattingAnd00OrPlusAndShortNumbersNeverMatch() {
    String a = add("firstName", "A", "phone", "+386 41 123 456");
    String b = add("firstName", "B", "phone", "00386-41-123-456");
    String c = add("firstName", "C", "phone", "(00386) 41 123456");
    add("firstName", "D", "phone", "12345");
    add("firstName", "E", "phone", "1-2-3-4-5");
    add("firstName", "F", "phone", "041 123 456");
    assertThat(sets()).containsExactly(Set.of(a, b, c));
  }

  @Test
  void AC_010_03_fullNamesMatchIgnoringCaseSpacesAndDiacriticsAndAFirstNameAloneNeverMatches() {
    String a = add("firstName", "Saša", "lastName", "Đurić");
    String b = add("firstName", "  sasa ", "lastName", "DURIC");
    String c = add("firstName", "Sa  ša", "lastName", "Đurić");
    add("firstName", "Saša");
    add("firstName", "Saša", "email", "x@example.si");
    add("lastName", "Đurić");
    List<Set<String>> s = sets();
    assertThat(s).hasSize(1);
    assertThat(s.get(0)).contains(a, b).doesNotContain(c);
  }

  @Test
  void AC_010_04_matchesAreGroupedTransitivelyWithEveryMatchKindListed() {
    String a = add("firstName", "Ana", "lastName", "Kos", "email", "ana@example.si");
    String b = add("firstName", "Anka", "email", "ANA@example.si", "phone", "+386 40 555 666");
    String c = add("firstName", "Cilka", "phone", "00386 40 555 666");
    String d = add("firstName", "ana", "lastName", "kos");
    String e = add("firstName", "Lonely", "email", "lonely@example.si");
    assertThat(sets()).containsExactly(Set.of(a, b, c, d));
    JsonNode set = api.get(owner.token(), "/api/workspaces/" + w + "/duplicate-sets").json().get(0);
    assertThat(set.get("matches").valueStream().map(m -> m.get("kind").asText())).containsExactlyInAnyOrder("EMAIL", "PHONE", "NAME");
    JsonNode email = set.get("matches").valueStream().filter(m -> m.get("kind").asText().equals("EMAIL")).findFirst().orElseThrow();
    assertThat(email.get("contactIds").valueStream().map(JsonNode::asText)).containsExactlyInAnyOrder(a, b);
    assertThat(email.get("value").asText()).isEqualTo("ana@example.si");
    assertThat(e).isNotNull();
  }

  @Test
  void AC_010_05_deletedContactsLeaveTheirSets() {
    String a = add("firstName", "A", "email", "x@example.si");
    String b = add("firstName", "B", "email", "x@example.si");
    String c = add("firstName", "C", "email", "x@example.si");
    api.delete(owner.token(), contacts + "/" + c);
    assertThat(sets()).containsExactly(Set.of(a, b));
    api.delete(owner.token(), contacts + "/" + b);
    assertThat(sets()).isEmpty();
  }

  @Test
  void possibleDuplicatesListEveryMatch() {
    for (int i = 0; i < 25; i++) add("firstName", "K" + i, "email", "skupni@example.si");
    Api.Res r = api.post(owner.token(), contacts, contact("firstName", "Nov", "email", "SKUPNI@example.si"));
    assertThat(r.status()).isEqualTo(201);
    assertThat(r.json().get("possibleDuplicates").size()).isEqualTo(25);
  }

  @Test
  void AC_010_06_createAndUpdateReturnPossibleDuplicatesWithoutBlockingTheSave() {
    String a = add("firstName", "Ana", "lastName", "Kos", "email", "ana@example.si", "phone", "041 222 333");
    Api.Res created = api.post(owner.token(), contacts, contact("firstName", "ANA", "lastName", "kos", "email", "Ana@Example.si"));
    assertThat(created.status()).isEqualTo(201);
    JsonNode dup = created.json().get("possibleDuplicates");
    assertThat(dup.size()).isEqualTo(1);
    assertThat(dup.get(0).get("id").asText()).isEqualTo(a);
    assertThat(dup.get(0).get("matchKinds").valueStream().map(JsonNode::asText)).containsExactly("EMAIL", "NAME");
    String b = created.json().get("id").asText();
    assertThat(api.get(owner.token(), contacts + "/" + b).status()).isEqualTo(200);

    Api.Res other = api.post(owner.token(), contacts, contact("firstName", "Bor"));
    assertThat(other.json().get("possibleDuplicates").size()).isZero();
    Api.Res updated = api.put(owner.token(), contacts + "/" + other.json().get("id").asText(),
        contact("version", 1, "firstName", "Bor", "phone", "+386 41 222 333"));
    assertThat(updated.status()).isEqualTo(200);
    assertThat(updated.json().get("possibleDuplicates").size()).isZero();
    Api.Res updated2 = api.put(owner.token(), contacts + "/" + other.json().get("id").asText(),
        contact("version", 2, "firstName", "Bor", "phone", "041-222-333"));
    assertThat(updated2.json().get("possibleDuplicates").get(0).get("matchKinds").get(0).asText()).isEqualTo("PHONE");
  }
}
