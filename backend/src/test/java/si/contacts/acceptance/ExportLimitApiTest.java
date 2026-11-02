package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import si.contacts.support.ApiTestBase;

/** AC-012-05: more Contacts than the Export limit are rejected (limit lowered from 10,000 for speed). */
@TestPropertySource(properties = "app.export.max-contacts=3")
class ExportLimitApiTest extends ApiTestBase {

  @Test
  void moreContactsThanTheLimitAreRejected() {
    TestUser owner = user("Owner");
    String w = createWorkspace(owner, "Meja");
    for (int i = 0; i < 3; i++) createContact(owner, w, contact("firstName", "K" + i));
    assertThat(api.post(owner.token(), "/api/workspaces/" + w + "/export", Map.of("filter", Map.of())).status()).isEqualTo(200);
    java.util.List<String> ids = api.get(owner.token(), "/api/workspaces/" + w + "/contacts").json().get("items").valueStream().map(n -> n.get("id").asText()).toList();
    assertThat(api.post(owner.token(), "/api/workspaces/" + w + "/export", Map.of("contactIds", ids)).status()).isEqualTo(200);
    String fourth = createContact(owner, w, contact("firstName", "K4")).get("id").asText();
    java.util.List<String> four = new java.util.ArrayList<>(ids);
    four.add(fourth);
    var tooMany = api.post(owner.token(), "/api/workspaces/" + w + "/export", Map.of("contactIds", four));
    assertThat(tooMany.status()).isEqualTo(400);
    assertThat(errorFields(tooMany)).containsExactly("contactIds");
    var r = api.post(owner.token(), "/api/workspaces/" + w + "/export", Map.of("filter", Map.of()));
    assertThat(r.status()).isEqualTo(400);
    assertThat(errorFields(r)).containsExactly("filter");
  }
}
