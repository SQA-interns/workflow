package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;

/** US-002: Workspaces. */
class WorkspaceApiTest extends ApiTestBase {

  @Test
  void AC_002_01_creatingAWorkspaceMakesTheCreatorOwner() {
    TestUser u = user("Ana");
    Api.Res r = api.post(u.token(), "/api/workspaces", Map.of("name", "  Projekt Škofja Loka  "));
    assertThat(r.status()).isEqualTo(201);
    assertThat(r.json().get("name").asText()).isEqualTo("Projekt Škofja Loka");
    assertThat(r.json().get("role").asText()).isEqualTo("OWNER");
    String id = r.json().get("id").asText();
    Api.Res one = api.get(u.token(), "/api/workspaces/" + id);
    assertThat(one.status()).isEqualTo(200);
    assertThat(one.json().get("role").asText()).isEqualTo("OWNER");
  }

  @Test
  void AC_002_02_emptyWhitespaceOrOverlongNamesAreRejected() {
    TestUser u = user("Ana");
    for (Object name : new Object[] {"", "   ", "x".repeat(101)}) {
      Api.Res r = api.post(u.token(), "/api/workspaces", Map.of("name", name));
      assertThat(r.status()).as("name '%s'", name).isEqualTo(400);
      assertThat(errorFields(r)).containsExactly("name");
    }
    Api.Res missing = api.post(u.token(), "/api/workspaces", Map.of());
    assertThat(missing.status()).isEqualTo(400);
    assertThat(errorFields(missing)).containsExactly("name");
    assertThat(api.post(u.token(), "/api/workspaces", "{not json").status()).isEqualTo(400);
  }

  @Test
  void AC_002_03_theListShowsOnlyTheCallersWorkspacesWithTheirRole() {
    TestUser a = user("Ana");
    TestUser b = user("Bor");
    String wa = createWorkspace(a, "B projekt");
    String wa2 = createWorkspace(a, "A projekt");
    createWorkspace(b, "Borov");
    Api.Res r = api.get(a.token(), "/api/workspaces");
    assertThat(r.status()).isEqualTo(200);
    assertThat(r.json().valueStream().map(n -> n.get("id").asText())).containsExactly(wa2, wa);
    assertThat(r.json().valueStream().map(n -> n.get("role").asText())).containsOnly("OWNER");
  }

  @Test
  void ownerRenamesTheWorkspace() {
    TestUser a = user("Ana");
    String w = createWorkspace(a, "Staro");
    Api.Res r = api.patch(a.token(), "/api/workspaces/" + w, Map.of("name", "Novo ime"));
    assertThat(r.status()).isEqualTo(200);
    assertThat(api.get(a.token(), "/api/workspaces/" + w).json().get("name").asText()).isEqualTo("Novo ime");
    assertThat(api.patch(a.token(), "/api/workspaces/" + w, Map.of("name", " ")).status()).isEqualTo(400);
  }

  @Test
  void aNonMemberGets404IdenticalToAMissingWorkspace() {
    TestUser a = user("Ana");
    TestUser stranger = user("Tujec");
    String w = createWorkspace(a, "Zasebno");
    Api.Res foreign = api.get(stranger.token(), "/api/workspaces/" + w);
    Api.Res missing = api.get(stranger.token(), "/api/workspaces/" + UUID.randomUUID());
    Api.Res garbage = api.get(stranger.token(), "/api/workspaces/not-a-uuid");
    assertThat(foreign.status()).isEqualTo(404);
    assertThat(missing.status()).isEqualTo(404);
    assertThat(garbage.status()).isEqualTo(404);
    assertThat(foreign.body()).isEqualTo(missing.body()).isEqualTo(garbage.body());
    assertThat(api.patch(stranger.token(), "/api/workspaces/" + w, Map.of("name", "x")).body())
        .isEqualTo(missing.body());
  }
}
