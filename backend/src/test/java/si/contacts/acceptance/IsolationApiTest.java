package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-004: Workspaces are fully isolated. */
class IsolationApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contactId;
  String ownerId;
  String invitationId;

  @BeforeEach
  void privateWorkspace() {
    owner = user("Owner");
    ownerId = api.get(owner.token(), "/api/me").json().get("id").asText();
    w = createWorkspace(owner, "Zasebno");
    contactId = createContact(owner, w, contact("firstName", "Skrivnost", "email", "skrit@example.si", "tags", List.of("tajno"))).get("id").asText();
    api.delete(owner.token(), "/api/workspaces/" + w + "/contacts/" + createContact(owner, w, contact("firstName", "Izbrisan")).get("id").asText());
    invitationId = api.post(owner.token(), "/api/workspaces/" + w + "/members", Map.of("email", "inv@example.si", "role", "VIEWER"))
        .json().get("invitation").get("id").asText();
  }

  record Call(String method, String path, Object body) {}

  List<Call> everyEndpoint(String ws, String cid) {
    String c = "/api/workspaces/" + ws + "/contacts/" + cid;
    Map<String, Object> contactBody = contact("version", 1, "firstName", "Napad");
    return List.of(
        new Call("GET", "/api/workspaces/" + ws, null),
        new Call("PATCH", "/api/workspaces/" + ws, Map.of("name", "Prevzeto")),
        new Call("DELETE", "/api/workspaces/" + ws, Map.of("confirmName", "Zasebno")),
        new Call("GET", "/api/workspaces/" + ws + "/members", null),
        new Call("POST", "/api/workspaces/" + ws + "/members", Map.of("email", "napadalec@example.si", "role", "OWNER")),
        new Call("PATCH", "/api/workspaces/" + ws + "/members/" + ownerId, Map.of("role", "VIEWER")),
        new Call("DELETE", "/api/workspaces/" + ws + "/members/" + ownerId, null),
        new Call("DELETE", "/api/workspaces/" + ws + "/invitations/" + invitationId, null),
        new Call("GET", "/api/workspaces/" + ws + "/contacts", null),
        new Call("GET", "/api/workspaces/" + ws + "/contacts?deleted=true", null),
        new Call("POST", "/api/workspaces/" + ws + "/contacts", contactBody),
        new Call("GET", c, null),
        new Call("PUT", c, contactBody),
        new Call("DELETE", c, null),
        new Call("POST", c + "/restore", null),
        new Call("POST", c + "/purge", null),
        new Call("GET", c + "/revisions", null),
        new Call("POST", c + "/revisions/1/restore", Map.of("version", 1)),
        new Call("GET", "/api/workspaces/" + ws + "/tags", null),
        new Call("PATCH", "/api/workspaces/" + ws + "/tags/tajno", Map.of("name", "javno")),
        new Call("DELETE", "/api/workspaces/" + ws + "/tags/tajno", null),
        new Call("GET", "/api/workspaces/" + ws + "/duplicate-sets", null),
        new Call("POST", "/api/workspaces/" + ws + "/merge",
            Map.of("survivorId", cid, "contacts", List.of(Map.of("id", cid, "version", 1), Map.of("id", UUID.randomUUID().toString(), "version", 1)))),
        new Call("POST", "/api/workspaces/" + ws + "/export", Map.of("filter", Map.of())),
        new Call("POST", "/api/workspaces/" + ws + "/export", Map.of("contactIds", List.of(cid))));
  }

  @Test
  void AC_004_01_everyWorkspaceEndpointAnswersANonMemberWith404LikeAMissingWorkspace() {
    TestUser stranger = user("Tujec");
    String missingBody = api.get(stranger.token(), "/api/workspaces/" + UUID.randomUUID()).body();
    for (Call call : everyEndpoint(w, contactId)) {
      Api.Res r = api.send(stranger.token(), call.method(), call.path(), call.body());
      assertThat(r.status()).as(call.toString()).isEqualTo(404);
      assertThat(r.body()).as(call.toString()).isEqualTo(missingBody);
    }
    for (Call call : everyEndpoint(UUID.randomUUID().toString(), UUID.randomUUID().toString())) {
      Api.Res r = api.send(stranger.token(), call.method(), call.path(), call.body());
      assertThat(r.status()).as(call.toString()).isEqualTo(404);
      assertThat(r.body()).as(call.toString()).isEqualTo(missingBody);
    }
    assertUntouched();
  }

  void assertUntouched() {
    assertUntouched(1);
  }

  void assertUntouched(int memberCount) {
    JsonNode ws = api.get(owner.token(), "/api/workspaces/" + w).json();
    assertThat(ws.get("name").asText()).isEqualTo("Zasebno");
    JsonNode c = api.get(owner.token(), "/api/workspaces/" + w + "/contacts/" + contactId).json();
    assertThat(c.get("firstName").asText()).isEqualTo("Skrivnost");
    assertThat(c.get("version").asInt()).isEqualTo(1);
    JsonNode members = api.get(owner.token(), "/api/workspaces/" + w + "/members").json();
    assertThat(members.get("members").size()).isEqualTo(memberCount);
    assertThat(members.get("members").valueStream().filter(m -> m.get("role").asText().equals("OWNER")).count()).isEqualTo(1);
    assertThat(members.get("invitations").size()).isEqualTo(1);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/tags").json().get(0).get("name").asText()).isEqualTo("tajno");
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/contacts").json().get("total").asInt()).isEqualTo(1);
  }

  @Test
  void AC_004_02_aContactCannotBeReadOrChangedThroughAnotherWorkspacesPath() {
    String mine = createWorkspace(owner, "Moj drugi");
    for (Call call : everyEndpoint(mine, contactId)) {
      if (!call.path().contains("/contacts/")) continue;
      Api.Res r = api.send(owner.token(), call.method(), call.path(), call.body());
      assertThat(r.status()).as(call.toString()).isEqualTo(404);
    }
    Api.Res merge = api.post(owner.token(), "/api/workspaces/" + mine + "/merge",
        Map.of("survivorId", contactId, "contacts", List.of(Map.of("id", contactId, "version", 1), Map.of("id", createContact(owner, mine, contact("firstName", "X")).get("id").asText(), "version", 1))));
    assertThat(merge.status()).isEqualTo(400);
    assertThat(api.post(owner.token(), "/api/workspaces/" + mine + "/export", Map.of("contactIds", List.of(contactId))).status()).isEqualTo(400);
    assertUntouched();
  }

  @Test
  void AC_004_03_listsTagCountsDuplicateSetsAndFilterExportsNeverMixWorkspaces() {
    String other = createWorkspace(owner, "Drugi");
    createContact(owner, other, contact("firstName", "Skrivnost", "email", "skrit@example.si", "tags", List.of("tajno", "drugje")));
    createContact(owner, other, contact("firstName", "Dvojnik", "email", "skrit@example.si"));
    JsonNode list = api.get(owner.token(), "/api/workspaces/" + w + "/contacts?q=skrivnost").json();
    assertThat(list.get("total").asInt()).isEqualTo(1);
    assertThat(list.get("items").get(0).get("id").asText()).isEqualTo(contactId);
    JsonNode tags = api.get(owner.token(), "/api/workspaces/" + w + "/tags").json();
    assertThat(tags.size()).isEqualTo(1);
    assertThat(tags.get(0).get("count").asInt()).isEqualTo(1);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/duplicate-sets").json().size()).isZero();
    assertThat(api.get(owner.token(), "/api/workspaces/" + other + "/duplicate-sets").json().get(0).get("contacts").size()).isEqualTo(2);
    Api.Res export = api.post(owner.token(), "/api/workspaces/" + w + "/export", Map.of("filter", Map.of("q", "skrit")));
    assertThat(export.status()).isEqualTo(200);
    try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(export.bytes()))) {
      assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(1);
    } catch (java.io.IOException e) {
      throw new AssertionError(e);
    }
    Api.Res renamed = api.patch(owner.token(), "/api/workspaces/" + other + "/tags/tajno", Map.of("name", "javno"));
    assertThat(renamed.status()).isEqualTo(200);
    assertThat(api.get(owner.token(), "/api/workspaces/" + w + "/tags").json().get(0).get("name").asText()).isEqualTo("tajno");
  }

  @Test
  void AC_004_05_idsRolesOrAuthorsInRequestBodiesNeverWidenAccess() {
    TestUser viewer = user("Bralec");
    addMember(owner, w, viewer, "VIEWER");
    String viewerWs = createWorkspace(viewer, "Bralčev");
    Api.Res created = api.post(viewer.token(), "/api/workspaces/" + viewerWs + "/contacts",
        contact("firstName", "Nov", "id", contactId, "workspaceId", w, "version", 7, "deleted", true, "mergedInto", contactId, "author", ownerId));
    assertThat(created.status()).isEqualTo(201);
    assertThat(created.json().get("id").asText()).isNotEqualTo(contactId);
    assertThat(created.json().get("version").asInt()).isEqualTo(1);
    assertThat(created.json().get("deleted").asBoolean()).isFalse();
    assertThat(created.json().get("mergedInto").isNull()).isTrue();
    JsonNode rev = api.get(viewer.token(), "/api/workspaces/" + viewerWs + "/contacts/" + created.json().get("id").asText() + "/revisions").json().get(0);
    assertThat(rev.get("author").get("email").asText()).isEqualTo(viewer.email());

    assertThat(api.post(viewer.token(), "/api/workspaces/" + w + "/contacts", contact("firstName", "X", "role", "OWNER")).status()).isEqualTo(403);
    String viewerId = api.get(viewer.token(), "/api/me").json().get("id").asText();
    assertThat(api.patch(viewer.token(), "/api/workspaces/" + w + "/members/" + viewerId, Map.of("role", "OWNER")).status()).isEqualTo(403);
    assertThat(api.get(viewer.token(), "/api/workspaces/" + w).json().get("role").asText()).isEqualTo("VIEWER");
    assertUntouched(2);
  }
}
