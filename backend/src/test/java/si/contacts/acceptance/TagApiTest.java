package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-007: Tags. */
class TagApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;
  String tags;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Oznake");
    contacts = "/api/workspaces/" + w + "/contacts";
    tags = "/api/workspaces/" + w + "/tags";
  }

  String create(String name, String... tagNames) {
    return createContact(owner, w, contact("firstName", name, "tags", List.of(tagNames))).get("id").asText();
  }

  Map<String, Integer> counts() {
    Map<String, Integer> m = new java.util.LinkedHashMap<>();
    api.get(owner.token(), tags).json().valueStream().forEach(t -> m.put(t.get("name").asText(), t.get("count").asInt()));
    return m;
  }

  @Test
  void AC_007_01_02_tagsAreCreatedImplicitlyAndReusedCaseInsensitivelyWithCorrectCounts() {
    String a = create("A", "neObvescaj", "udelezenec2025");
    JsonNode b = createContact(owner, w, contact("firstName", "B", "tags", List.of("NEOBVESCAJ")));
    assertThat(b.get("tags").get(0).asText()).isEqualTo("neObvescaj");
    String c = create("C", "udelezenec2025");
    assertThat(counts()).containsExactly(Map.entry("neObvescaj", 2), Map.entry("udelezenec2025", 2));
    api.delete(owner.token(), contacts + "/" + c);
    assertThat(counts()).containsEntry("udelezenec2025", 1);
    assertThat(api.get(owner.token(), contacts + "/" + a).json().get("tags").valueStream().map(JsonNode::asText))
        .containsExactly("neObvescaj", "udelezenec2025");
  }

  @Test
  void AC_007_03_invalidTagsAreRejected() {
    for (List<String> bad : List.of(List.of("ima presledek"), List.of("x".repeat(51)), List.of("vip", "VIP"))) {
      Api.Res r = api.post(owner.token(), contacts, contact("firstName", "A", "tags", bad));
      assertThat(r.status()).as(bad.toString()).isEqualTo(400);
      assertThat(errorFields(r).get(0)).startsWith("tags[");
    }
    List<String> many = new ArrayList<>();
    for (int i = 0; i < 51; i++) many.add("t" + i);
    Api.Res tooMany = api.post(owner.token(), contacts, contact("firstName", "A", "tags", many));
    assertThat(tooMany.status()).isEqualTo(400);
    assertThat(errorFields(tooMany)).containsExactly("tags");
    assertThat(api.post(owner.token(), contacts, contact("firstName", "A", "tags", many.subList(0, 50))).status()).isEqualTo(201);
  }

  @Test
  void AC_007_04_renameUpdatesEveryContactAndWritesAnUpdateRevisionOnEach() {
    String a = create("A", "staro", "drugo");
    String b = create("B", "staro");
    String other = create("C", "drugo");
    Api.Res r = api.patch(owner.token(), tags + "/STARO", Map.of("name", "novo"));
    assertThat(r.status()).isEqualTo(200);
    assertThat(r.json().get("name").asText()).isEqualTo("novo");
    assertThat(r.json().get("count").asInt()).isEqualTo(2);
    for (String id : List.of(a, b)) {
      JsonNode c = api.get(owner.token(), contacts + "/" + id).json();
      assertThat(c.get("tags").valueStream().map(JsonNode::asText)).contains("novo").doesNotContain("staro");
      assertThat(c.get("version").asInt()).isEqualTo(2);
      JsonNode rev = api.get(owner.token(), contacts + "/" + id + "/revisions").json().get(0);
      assertThat(rev.get("type").asText()).isEqualTo("UPDATE");
      assertThat(rev.get("state").get("tags").valueStream().map(JsonNode::asText)).contains("novo");
    }
    assertThat(api.get(owner.token(), contacts + "/" + a).json().get("tags").valueStream().map(JsonNode::asText))
        .containsExactly("novo", "drugo");
    assertThat(api.get(owner.token(), contacts + "/" + other).json().get("version").asInt()).isEqualTo(1);
    assertThat(api.patch(owner.token(), tags + "/novo", Map.of("name", "Novo")).status()).isEqualTo(200);
    assertThat(counts()).containsKey("Novo");
    assertThat(api.patch(owner.token(), tags + "/ni-ga", Map.of("name", "x")).status()).isEqualTo(404);
    assertThat(api.patch(owner.token(), tags + "/Novo", Map.of("name", "ima presledek")).status()).isEqualTo(400);
  }

  @Test
  void AC_007_05_renamingOntoAnExistingNameIsRejected() {
    create("A", "prvi", "drugi");
    Api.Res r = api.patch(owner.token(), tags + "/prvi", Map.of("name", "DRUGI"));
    assertThat(r.status()).isEqualTo(409);
    assertThat(counts()).containsExactly(Map.entry("drugi", 1), Map.entry("prvi", 1));
  }

  @Test
  void AC_007_06_deleteRemovesTheTagFromEveryContactWithARevisionEach() {
    String a = create("A", "brisi", "ostane");
    String b = create("B", "Brisi");
    assertThat(api.delete(owner.token(), tags + "/BRISI").status()).isEqualTo(204);
    assertThat(counts()).containsExactly(Map.entry("ostane", 1));
    assertThat(api.get(owner.token(), contacts + "/" + a).json().get("tags").valueStream().map(JsonNode::asText)).containsExactly("ostane");
    for (String id : List.of(a, b)) {
      JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
      assertThat(revs.size()).isEqualTo(2);
      assertThat(revs.get(0).get("type").asText()).isEqualTo("UPDATE");
    }
    assertThat(api.delete(owner.token(), tags + "/brisi").status()).isEqualTo(404);
  }

  @Test
  void AC_007_07_aViewerCannotRenameOrDeleteTags() {
    TestUser viewer = user("Viewer");
    addMember(owner, w, viewer, "VIEWER");
    create("A", "oznaka");
    assertThat(api.patch(viewer.token(), tags + "/oznaka", Map.of("name", "x")).status()).isEqualTo(403);
    assertThat(api.delete(viewer.token(), tags + "/oznaka").status()).isEqualTo(403);
    assertThat(api.get(viewer.token(), tags).status()).isEqualTo(200);
    assertThat(counts()).containsEntry("oznaka", 1);
  }
}
