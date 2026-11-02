package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-009: Revision history and Restore. */
class RevisionApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;

  @BeforeEach
  void workspace() {
    owner = user("Owner Revizij");
    w = createWorkspace(owner, "Revizije");
    contacts = "/api/workspaces/" + w + "/contacts";
  }

  @Test
  void AC_009_01_revisionsAreListedNewestFirstWithNumberTypeAuthorAndFullState() {
    TestUser editor = user("Urednica");
    addMember(owner, w, editor, "EDITOR");
    String id = createContact(owner, w, contact("firstName", "Ana", "tags", List.of("t1"),
        "attributes", List.of(Map.of("key", "k", "value", "v")))).get("id").asText();
    api.put(editor.token(), contacts + "/" + id, contact("version", 1, "firstName", "Ana", "lastName", "Kos", "author", "lažni"));
    api.delete(editor.token(), contacts + "/" + id);
    JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    assertThat(revs.valueStream().map(r -> r.get("number").asInt())).containsExactly(3, 2, 1);
    assertThat(revs.valueStream().map(r -> r.get("type").asText())).containsExactly("DELETE", "UPDATE", "CREATE");
    assertThat(revs.get(1).get("author").get("email").asText()).isEqualTo(editor.email());
    assertThat(revs.get(2).get("author").get("email").asText()).isEqualTo(owner.email());
    assertThat(revs.get(2).get("author").get("displayName").asText()).isEqualTo("Owner Revizij");
    assertThat(revs.get(2).get("createdAt").asText()).isNotBlank();
    JsonNode first = revs.get(2).get("state");
    assertThat(first.get("firstName").asText()).isEqualTo("Ana");
    assertThat(first.get("lastName").isNull()).isTrue();
    assertThat(first.get("tags").get(0).asText()).isEqualTo("t1");
    assertThat(first.get("attributes").get(0).get("key").asText()).isEqualTo("k");
    assertThat(first.get("deleted").asBoolean()).isFalse();
    assertThat(revs.get(1).get("state").get("lastName").asText()).isEqualTo("Kos");
    assertThat(revs.get(1).get("state").get("tags").size()).isZero();
    assertThat(revs.get(0).get("state").get("deleted").asBoolean()).isTrue();
  }

  @Test
  void AC_009_02_restoringRevision1WritesRevisionNPlus1EqualToItAndLeavesTheOthersUnchanged() {
    String id = createContact(owner, w, contact("firstName", "Prvotna", "city", "Kranj")).get("id").asText();
    api.put(owner.token(), contacts + "/" + id, contact("version", 1, "firstName", "Druga"));
    api.put(owner.token(), contacts + "/" + id, contact("version", 2, "firstName", "Tretja", "email", "t@example.si"));
    JsonNode before = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    Api.Res r = api.post(owner.token(), contacts + "/" + id + "/revisions/1/restore", Map.of("version", 3));
    assertThat(r.status()).isEqualTo(200);
    assertThat(r.json().get("version").asInt()).isEqualTo(4);
    assertThat(r.json().get("firstName").asText()).isEqualTo("Prvotna");
    assertThat(r.json().get("city").asText()).isEqualTo("Kranj");
    assertThat(r.json().get("email").isNull()).isTrue();
    JsonNode after = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    assertThat(after.get(0).get("number").asInt()).isEqualTo(4);
    assertThat(after.get(0).get("type").asText()).isEqualTo("RESTORE");
    assertThat(after.get(0).get("state")).isEqualTo(after.get(3).get("state"));
    for (int i = 0; i < 3; i++) assertThat(after.get(i + 1)).isEqualTo(before.get(i));
    assertThat(api.post(owner.token(), contacts + "/" + id + "/revisions/1/restore", Map.of("version", 3)).status()).isEqualTo(409);
    assertThat(api.post(owner.token(), contacts + "/" + id + "/revisions/9/restore", Map.of("version", 4)).status()).isEqualTo(404);
  }

  @Test
  void AC_009_03_restoringBringsBackATagDeletedFromTheWorkspaceSince() {
    String id = createContact(owner, w, contact("firstName", "A", "tags", List.of("Izgubljena"))).get("id").asText();
    assertThat(api.delete(owner.token(), "/api/workspaces/" + w + "/tags/izgubljena").status()).isEqualTo(204);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/tags").json().size()).isZero();
    Api.Res r = api.post(owner.token(), contacts + "/" + id + "/revisions/1/restore", Map.of("version", 2));
    assertThat(r.status()).isEqualTo(200);
    assertThat(r.json().get("tags").get(0).asText()).isEqualTo("Izgubljena");
    JsonNode tags = api.get(owner.token(), "/api/workspaces/" + w + "/tags").json();
    assertThat(tags.get(0).get("name").asText()).isEqualTo("Izgubljena");
    assertThat(tags.get(0).get("count").asInt()).isEqualTo(1);
  }

  @Test
  void AC_009_04_aDeletedContactIsRestoredWithItsLastStateAndRestoringAnEarlierRevisionIsRejected() {
    String id = createContact(owner, w, contact("firstName", "A")).get("id").asText();
    api.put(owner.token(), contacts + "/" + id, contact("version", 1, "firstName", "Zadnja", "tags", List.of("x")));
    api.delete(owner.token(), contacts + "/" + id);
    assertThat(api.post(owner.token(), contacts + "/" + id + "/revisions/1/restore", Map.of("version", 3)).status()).isEqualTo(409);
    Api.Res r = api.post(owner.token(), contacts + "/" + id + "/restore", null);
    assertThat(r.status()).isEqualTo(200);
    assertThat(r.json().get("deleted").asBoolean()).isFalse();
    assertThat(r.json().get("firstName").asText()).isEqualTo("Zadnja");
    assertThat(r.json().get("tags").get(0).asText()).isEqualTo("x");
    assertThat(r.json().get("version").asInt()).isEqualTo(4);
    JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    assertThat(revs.get(0).get("type").asText()).isEqualTo("RESTORE");
    assertThat(api.post(owner.token(), contacts + "/" + id + "/restore", null).status()).isEqualTo(409);
    assertThat(api.get(owner.token(), contacts).json().get("total").asInt()).isEqualTo(1);
  }

  @Test
  void AC_009_05_ofTwoConcurrentSavesOnTheSameVersionExactlyOneWins() throws Exception {
    for (int round = 0; round < 5; round++) {
      String id = createContact(owner, w, contact("firstName", "Sočasno")).get("id").asText();
      CyclicBarrier barrier = new CyclicBarrier(2);
      List<CompletableFuture<Integer>> saves =
          List.of("Prvi", "Drugi").stream()
              .map(name -> CompletableFuture.supplyAsync(() -> {
                try {
                  barrier.await();
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
                return api.put(owner.token(), contacts + "/" + id, contact("version", 1, "firstName", name)).status();
              }))
              .toList();
      List<Integer> statuses = saves.stream().map(CompletableFuture::join).sorted().toList();
      assertThat(statuses).containsExactly(200, 409);
      JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
      assertThat(revs.size()).isEqualTo(2);
    }
  }

  @Test
  void AC_009_08_noEndpointChangesOrDeletesARevision() {
    String id = createContact(owner, w, contact("firstName", "A")).get("id").asText();
    String rev = contacts + "/" + id + "/revisions/1";
    assertThat(api.put(owner.token(), rev, Map.of("type", "UPDATE")).status()).isIn(404, 405);
    assertThat(api.patch(owner.token(), rev, Map.of("type", "UPDATE")).status()).isIn(404, 405);
    assertThat(api.delete(owner.token(), rev).status()).isIn(404, 405);
    assertThat(api.delete(owner.token(), contacts + "/" + id + "/revisions").status()).isIn(404, 405);
    assertThat(api.post(owner.token(), contacts + "/" + id + "/revisions", Map.of("type", "UPDATE")).status()).isIn(404, 405);
    JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    assertThat(revs.size()).isEqualTo(1);
    assertThat(revs.get(0).get("type").asText()).isEqualTo("CREATE");
  }
}
