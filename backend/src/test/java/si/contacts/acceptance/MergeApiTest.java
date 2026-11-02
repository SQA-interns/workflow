package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-011: Merge. */
class MergeApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;
  String merge;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Združevanje");
    contacts = "/api/workspaces/" + w + "/contacts";
    merge = "/api/workspaces/" + w + "/merge";
  }

  String add(Object... kv) {
    return createContact(owner, w, contact(kv)).get("id").asText();
  }

  static Map<String, Object> ref(String id, int version) {
    return Map.of("id", id, "version", version);
  }

  Map<String, Object> request(String survivor, List<Map<String, Object>> refs, Map<String, String> fields, Map<String, String> attrs) {
    return contact("survivorId", survivor, "contacts", refs, "fieldSources", fields, "attributeSources", attrs);
  }

  JsonNode get(String id) {
    return api.get(owner.token(), contacts + "/" + id).json();
  }

  @Test
  void AC_011_01_02_03_defaultAndChosenSourcesAndTagsAndAttributesCombined() {
    String a = add("firstName", "Ana", "lastName", "Kos", "email", "ana@example.si", "city", null,
        "attributes", List.of(Map.of("key", "kompetenca", "value", "web"), Map.of("key", "jezik", "value", "sl")),
        "tags", List.of("vip", "skupno"));
    String b = add("firstName", "Ana", "lastName", "KOS", "email", "ana.kos@firma.si", "city", "Koper", "company", "Firma",
        "attributes", List.of(Map.of("key", "Kompetenca", "value", "oblikovanje"), Map.of("key", "vloga", "value", "vodja")),
        "tags", List.of("SKUPNO", "udelezenec2025"));
    String c = add("firstName", "Ana", "lastName", "Kos", "phone", "+386 41 000 111", "city", "Piran");

    Api.Res r = api.post(owner.token(), merge,
        request(a, List.of(ref(a, 1), ref(b, 1), ref(c, 1)), Map.of("email", b, "phone", c), Map.of("kompetenca", b)));
    assertThat(r.status()).as(r.toString()).isEqualTo(200);
    JsonNode s = r.json();
    assertThat(s.get("id").asText()).isEqualTo(a);
    assertThat(s.get("version").asInt()).isEqualTo(2);
    assertThat(s.get("firstName").asText()).isEqualTo("Ana");
    assertThat(s.get("lastName").asText()).isEqualTo("Kos");
    assertThat(s.get("email").asText()).isEqualTo("ana.kos@firma.si");
    assertThat(s.get("phone").asText()).isEqualTo("+386 41 000 111");
    assertThat(s.get("city").asText()).isEqualTo("Koper");
    assertThat(s.get("company").asText()).isEqualTo("Firma");
    assertThat(s.get("attributes").valueStream().map(x -> x.get("key").asText() + "=" + x.get("value").asText()))
        .containsExactly("kompetenca=oblikovanje", "jezik=sl", "vloga=vodja");
    assertThat(s.get("tags").valueStream().map(JsonNode::asText)).containsExactly("vip", "skupno", "udelezenec2025");
  }

  @Test
  void AC_011_04_theOthersBecomeDeletedContactsWithMergedIntoAndTheSurvivorGetsAMergeRevision() {
    String a = add("firstName", "A", "email", "x@example.si");
    String b = add("firstName", "B", "email", "x@example.si");
    assertThat(api.post(owner.token(), merge, request(b, List.of(ref(a, 1), ref(b, 1)), Map.of(), Map.of())).status()).isEqualTo(200);
    JsonNode gone = get(a);
    assertThat(gone.get("deleted").asBoolean()).isTrue();
    assertThat(gone.get("mergedInto").asText()).isEqualTo(b);
    JsonNode goneRev = api.get(owner.token(), contacts + "/" + a + "/revisions").json().get(0);
    assertThat(goneRev.get("type").asText()).isEqualTo("MERGED_AWAY");
    assertThat(goneRev.get("state").get("mergedInto").asText()).isEqualTo(b);
    assertThat(api.get(owner.token(), contacts + "/" + b + "/revisions").json().get(0).get("type").asText()).isEqualTo("MERGE");
    assertThat(api.get(owner.token(), contacts + "?deleted=true").json().get("items").get(0).get("id").asText()).isEqualTo(a);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/duplicate-sets").json().size()).isZero();
  }

  @Test
  void AC_011_05_invalidRequestsAreRejected() {
    String a = add("firstName", "A");
    String b = add("firstName", "B");
    String d = add("firstName", "D");
    api.delete(owner.token(), contacts + "/" + d);
    String foreignWs = createWorkspace(owner, "Drugi");
    String foreign = createContact(owner, foreignWs, contact("firstName", "F")).get("id").asText();
    List<Map<String, Object>> eleven = new ArrayList<>();
    for (int i = 0; i < 11; i++) eleven.add(ref(add("firstName", "N" + i), 1));

    List<Map<String, Object>> bad = List.of(
        request(a, List.of(ref(a, 1)), Map.of(), Map.of()),
        request(a, eleven, Map.of(), Map.of()),
        request(a, List.of(ref(a, 1), ref(a, 1)), Map.of(), Map.of()),
        request(b, List.of(ref(a, 1), ref(add("firstName", "C"), 1)), Map.of(), Map.of()),
        request(a, List.of(ref(a, 1), ref(b, 1)), Map.of("email", UUID.randomUUID().toString()), Map.of()),
        request(a, List.of(ref(a, 1), ref(b, 1)), Map.of("neobstaja", b), Map.of()),
        request(a, List.of(ref(a, 1), ref(b, 1)), Map.of(), Map.of("kljuc", b)),
        request(a, List.of(ref(a, 1), ref(d, 2)), Map.of(), Map.of()),
        request(a, List.of(ref(a, 1), ref(foreign, 1)), Map.of(), Map.of()),
        contact("survivorId", a));
    for (Map<String, Object> body : bad) {
      Api.Res r = api.post(owner.token(), merge, body);
      assertThat(r.status()).as(body.toString() + " -> " + r).isEqualTo(400);
    }
    assertThat(get(a).get("version").asInt()).isEqualTo(1);
    assertThat(get(foreign).get("deleted")).isNull();
    assertThat(api.get(owner.token(), "/api/workspaces/" + foreignWs + "/contacts/" + foreign).json().get("version").asInt()).isEqualTo(1);
  }

  @Test
  void AC_011_06_anyOutdatedVersionRejectsTheWholeMergeAndChangesNothing() {
    String a = add("firstName", "A");
    String b = add("firstName", "B");
    String c = add("firstName", "C");
    api.put(owner.token(), contacts + "/" + c, contact("version", 1, "firstName", "C2"));
    Api.Res r = api.post(owner.token(), merge, request(a, List.of(ref(a, 1), ref(b, 1), ref(c, 1)), Map.of(), Map.of()));
    assertThat(r.status()).isEqualTo(409);
    assertThat(get(a).get("version").asInt()).isEqualTo(1);
    assertThat(get(b).get("deleted").asBoolean()).isFalse();
    assertThat(get(b).get("version").asInt()).isEqualTo(1);
    assertThat(get(c).get("version").asInt()).isEqualTo(2);
  }

  @Test
  void AC_011_08_viewersCannotMerge() {
    TestUser viewer = user("Viewer");
    addMember(owner, w, viewer, "VIEWER");
    String a = add("firstName", "A");
    String b = add("firstName", "B");
    assertThat(api.post(viewer.token(), merge, request(a, List.of(ref(a, 1), ref(b, 1)), Map.of(), Map.of())).status()).isEqualTo(403);
    assertThat(get(b).get("deleted").asBoolean()).isFalse();
  }
}
