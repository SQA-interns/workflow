package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;

/** US-013 and US-002: permanent erasure of a Deleted contact and Workspace deletion. */
class ErasureApiTest extends ApiTestBase {

  @Test
  void AC_013_01_purgingADeletedContactRemovesItAndItsRevisions() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Izbris");
    String contacts = "/api/workspaces/" + w + "/contacts";
    String id = createContact(owner, w, contact("firstName", "Pozabi", "lastName", "Me", "tags", List.of("gdpr"))).get("id").asText();
    api.put(owner.token(), contacts + "/" + id, contact("version", 1, "firstName", "Pozabi", "lastName", "Me", "tags", List.of("gdpr")));
    api.delete(owner.token(), contacts + "/" + id);
    assertThat(api.post(owner.token(), contacts + "/" + id + "/purge", null).status()).isEqualTo(204);
    assertThat(api.get(owner.token(), contacts + "/" + id).status()).isEqualTo(404);
    assertThat(api.get(owner.token(), contacts + "/" + id + "/revisions").status()).isEqualTo(404);
    assertThat(api.get(owner.token(), contacts + "?deleted=true").json().get("total").asInt()).isZero();
    assertThat(api.post(owner.token(), contacts + "/" + id + "/restore", null).status()).isEqualTo(404);
    assertThat(api.post(owner.token(), contacts + "/" + id + "/purge", null).status()).isEqualTo(404);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/tags").json().get(0).get("count").asInt()).isZero();
  }

  @Test
  void AC_013_02_purgingAnActiveContactIsRejected() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Aktivni");
    String id = createContact(owner, w, contact("firstName", "Ostani")).get("id").asText();
    assertThat(api.post(owner.token(), "/api/workspaces/" + w + "/contacts/" + id + "/purge", null).status()).isEqualTo(409);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/contacts/" + id).status()).isEqualTo(200);
  }

  @Test
  void AC_013_03_editorsAndViewersCannotPurge() {
    TestUser owner = user("Owner");
    TestUser editor = user("Editor");
    TestUser viewer = user("Viewer");
    String w = createWorkspace(owner, "Pravice");
    addMember(owner, w, editor, "EDITOR");
    addMember(owner, w, viewer, "VIEWER");
    String id = createContact(owner, w, contact("firstName", "X")).get("id").asText();
    api.delete(owner.token(), "/api/workspaces/" + w + "/contacts/" + id);
    for (TestUser u : List.of(editor, viewer))
      assertThat(api.post(u.token(), "/api/workspaces/" + w + "/contacts/" + id + "/purge", null).status()).isEqualTo(403);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/contacts/" + id).status()).isEqualTo(200);
  }

  @Test
  void AC_002_05_deletingAWorkspaceWithTheExactNameRemovesItForEveryFormerMember() {
    TestUser owner = user("Owner");
    TestUser editor = user("Editor");
    String w = createWorkspace(owner, "Konec Projekta");
    addMember(owner, w, editor, "EDITOR");
    api.post(owner.token(), "/api/workspaces/" + w + "/members", Map.of("email", "pending@example.si", "role", "VIEWER"));
    String id = createContact(owner, w, contact("firstName", "A", "tags", List.of("t"))).get("id").asText();
    assertThat(api.delete(editor.token(), "/api/workspaces/" + w, Map.of("confirmName", "Konec Projekta")).status()).isEqualTo(403);
    assertThat(api.delete(owner.token(), "/api/workspaces/" + w, Map.of("confirmName", "Konec Projekta")).status()).isEqualTo(204);
    Api.Res missing = api.get(owner.token(), "/api/workspaces/" + java.util.UUID.randomUUID());
    for (TestUser u : List.of(owner, editor)) {
      Api.Res r = api.get(u.token(), "/api/workspaces/" + w);
      assertThat(r.status()).isEqualTo(404);
      assertThat(r.body()).isEqualTo(missing.body());
      assertThat(api.get(u.token(), "/api/workspaces/" + w + "/contacts/" + id).status()).isEqualTo(404);
      assertThat(api.get(u.token(), "/api/workspaces/" + w + "/contacts").status()).isEqualTo(404);
      assertThat(api.get(u.token(), "/api/workspaces").json().size()).isZero();
    }
  }

  @Test
  void AC_002_06_aWrongConfirmNameIsRejected() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Pravo Ime");
    for (Object body : new Object[] {Map.of("confirmName", "pravo ime"), Map.of("confirmName", "Pravo Ime "), Map.of()}) {
      Api.Res r = api.delete(owner.token(), "/api/workspaces/" + w, body);
      assertThat(r.status()).isEqualTo(400);
      assertThat(errorFields(r)).containsExactly("confirmName");
    }
    assertThat(api.get(owner.token(), "/api/workspaces/" + w).status()).isEqualTo(200);
  }
}
