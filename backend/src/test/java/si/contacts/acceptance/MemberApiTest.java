package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import si.contacts.support.AuthEmulator;
import si.contacts.support.Tokens;
import tools.jackson.databind.JsonNode;

/** US-003: Members, invitations and Roles. */
class MemberApiTest extends ApiTestBase {

  String members(String wid) {
    return "/api/workspaces/" + wid + "/members";
  }

  String userId(TestUser u) {
    return api.get(u.token(), "/api/me").json().get("id").asText();
  }

  @Test
  void AC_003_01_addingAnExistingVerifiedUserInAnyCaseMakesThemAMemberAtOnce() {
    TestUser owner = user("Owner");
    TestUser bor = user("Bor");
    String w = createWorkspace(owner, "Skupni");
    Api.Res r = api.post(owner.token(), members(w), Map.of("email", bor.email().toUpperCase(), "role", "EDITOR"));
    assertThat(r.status()).isEqualTo(201);
    assertThat(r.json().get("status").asText()).isEqualTo("MEMBER");
    assertThat(api.get(bor.token(), "/api/workspaces/" + w).json().get("role").asText()).isEqualTo("EDITOR");
    JsonNode list = api.get(bor.token(), members(w)).json();
    assertThat(list.get("members").valueStream().map(m -> m.get("role").asText())).containsExactlyInAnyOrder("OWNER", "EDITOR");
    assertThat(list.get("invitations").size()).isZero();
  }

  @Test
  void AC_003_02_03_aPendingInvitationActivatesOnlyForAMatchingVerifiedEmailThenDisappears() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Vabila");
    String email = "nova." + Tokens.randomUid().substring(0, 6) + "@example.si";
    Api.Res r = api.post(owner.token(), members(w), Map.of("email", email, "role", "VIEWER"));
    assertThat(r.status()).isEqualTo(201);
    assertThat(r.json().get("status").asText()).isEqualTo("INVITED");
    assertThat(api.get(owner.token(), members(w)).json().get("invitations").get(0).get("email").asText()).isEqualTo(email);

    AuthEmulator.Account account = AuthEmulator.signUp(email, "Nova", false);
    assertThat(api.get(account.token(), "/api/workspaces/" + w).status()).isEqualTo(404);
    TestUser impostor = user("Drug");
    assertThat(api.get(impostor.token(), "/api/workspaces/" + w).status()).isEqualTo(404);

    AuthEmulator.update(account.uid(), null, null, true);
    String verified = AuthEmulator.signIn(email).token();
    Api.Res now = api.get(verified, "/api/workspaces/" + w);
    assertThat(now.status()).isEqualTo(200);
    assertThat(now.json().get("role").asText()).isEqualTo("VIEWER");
    assertThat(api.get(owner.token(), members(w)).json().get("invitations").size()).isZero();
  }

  @Test
  void AC_003_04_addingAMemberOrInvitedPersonAgainIsRejected() {
    TestUser owner = user("Owner");
    TestUser bor = user("Bor");
    String w = createWorkspace(owner, "Dvakrat");
    addMember(owner, w, bor, "VIEWER");
    assertThat(api.post(owner.token(), members(w), Map.of("email", bor.email(), "role", "EDITOR")).status()).isEqualTo(409);
    assertThat(api.post(owner.token(), members(w), Map.of("email", owner.email(), "role", "EDITOR")).status()).isEqualTo(409);
    api.post(owner.token(), members(w), Map.of("email", "pending@example.si", "role", "VIEWER"));
    assertThat(api.post(owner.token(), members(w), Map.of("email", "PENDING@example.si", "role", "EDITOR")).status()).isEqualTo(409);
  }

  @Test
  void invalidEmailOrRoleIsRejected() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Napake");
    Api.Res bad = api.post(owner.token(), members(w), Map.of("email", "ni-email", "role", "VIEWER"));
    assertThat(bad.status()).isEqualTo(400);
    assertThat(errorFields(bad)).containsExactly("email");
    Api.Res role = api.post(owner.token(), members(w), Map.of("email", "x@example.si", "role", "ADMIN"));
    assertThat(role.status()).isEqualTo(400);
    assertThat(errorFields(role)).containsExactly("role");
  }

  @Test
  void AC_003_05_06_theLastOwnerCannotLeaveBeRemovedOrDemotedButWithTwoOwnersADemotionWorks() {
    TestUser owner = user("Owner");
    TestUser second = user("Second");
    String w = createWorkspace(owner, "Lastniki");
    String ownerId = userId(owner);
    assertThat(api.delete(owner.token(), members(w) + "/" + ownerId).status()).isEqualTo(409);
    assertThat(api.patch(owner.token(), members(w) + "/" + ownerId, Map.of("role", "EDITOR")).status()).isEqualTo(409);

    addMember(owner, w, second, "OWNER");
    Api.Res demote = api.patch(second.token(), members(w) + "/" + ownerId, Map.of("role", "EDITOR"));
    assertThat(demote.status()).isEqualTo(200);
    assertThat(demote.json().get("role").asText()).isEqualTo("EDITOR");
    assertThat(api.patch(owner.token(), "/api/workspaces/" + w, Map.of("name", "x")).status()).isEqualTo(403);
    assertThat(api.delete(second.token(), members(w) + "/" + userId(second)).status()).isEqualTo(409);
  }

  @Test
  void AC_003_07_aMemberWhoLeavesNoLongerSeesTheWorkspace() {
    TestUser owner = user("Owner");
    TestUser bor = user("Bor");
    String w = createWorkspace(owner, "Odhod");
    addMember(owner, w, bor, "EDITOR");
    assertThat(api.delete(bor.token(), members(w) + "/" + userId(bor)).status()).isEqualTo(204);
    assertThat(api.get(bor.token(), "/api/workspaces/" + w).status()).isEqualTo(404);
    assertThat(api.get(bor.token(), "/api/workspaces").json().size()).isZero();
  }

  @Test
  void ownerRemovesAMember() {
    TestUser owner = user("Owner");
    TestUser bor = user("Bor");
    String w = createWorkspace(owner, "Odstrani");
    addMember(owner, w, bor, "VIEWER");
    assertThat(api.delete(owner.token(), members(w) + "/" + userId(bor)).status()).isEqualTo(204);
    assertThat(api.get(bor.token(), "/api/workspaces/" + w).status()).isEqualTo(404);
    assertThat(api.delete(owner.token(), members(w) + "/" + userId(bor)).status()).isEqualTo(404);
  }

  @Test
  void AC_003_08_AC_002_04_editorsAndViewersCannotManageMembersOrRenameTheWorkspace() {
    TestUser owner = user("Owner");
    TestUser editor = user("Editor");
    TestUser viewer = user("Viewer");
    String w = createWorkspace(owner, "Pravice");
    addMember(owner, w, editor, "EDITOR");
    addMember(owner, w, viewer, "VIEWER");
    String ownerId = userId(owner);
    String inv =
        api.post(owner.token(), members(w), Map.of("email", "inv@example.si", "role", "VIEWER")).json().get("invitation").get("id").asText();
    for (TestUser u : new TestUser[] {editor, viewer}) {
      assertThat(api.post(u.token(), members(w), Map.of("email", "z@example.si", "role", "VIEWER")).status()).isEqualTo(403);
      assertThat(api.patch(u.token(), members(w) + "/" + ownerId, Map.of("role", "VIEWER")).status()).isEqualTo(403);
      assertThat(api.delete(u.token(), members(w) + "/" + ownerId).status()).isEqualTo(403);
      assertThat(api.delete(u.token(), "/api/workspaces/" + w + "/invitations/" + inv).status()).isEqualTo(403);
      assertThat(api.patch(u.token(), "/api/workspaces/" + w, Map.of("name", "Novo")).status()).isEqualTo(403);
      assertThat(api.get(u.token(), members(w)).status()).isEqualTo(200);
    }
  }

  @Test
  void AC_003_09_aCancelledInvitationNeverGrantsAccess() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Preklic");
    String email = "preklic." + Tokens.randomUid().substring(0, 6) + "@example.si";
    String inv = api.post(owner.token(), members(w), Map.of("email", email, "role", "EDITOR")).json().get("invitation").get("id").asText();
    assertThat(api.delete(owner.token(), "/api/workspaces/" + w + "/invitations/" + inv).status()).isEqualTo(204);
    String token = AuthEmulator.signUp(email, "P", true).token();
    assertThat(api.get(token, "/api/workspaces/" + w).status()).isEqualTo(404);
    assertThat(api.get(owner.token(), members(w)).json().get("invitations").size()).isZero();
  }
}
