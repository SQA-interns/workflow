package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import si.contacts.support.Tokens;

/** US-001: sign-in identity and the User record. */
class SignInApiTest extends ApiTestBase {

  @Test
  void AC_001_01_requestsWithoutAValidTokenGet401AndNoData() {
    String uid = Tokens.randomUid();
    String expired =
        Tokens.emulator(Tokens.PROJECT, uid, "a@example.si", true, "A", Instant.now().minusSeconds(60));
    String foreign =
        Tokens.emulator("demo-other", uid, "a@example.si", true, "A", Instant.now().plusSeconds(600));
    for (String token : new String[] {null, "not-a-jwt", "a.b.c", expired, foreign}) {
      Api.Res r = api.get(token, "/api/workspaces");
      assertThat(r.status()).as("token %s", token).isEqualTo(401);
      assertThat(r.body()).doesNotContain("\"id\"");
    }
    Api.Res bare = api.sendRaw(null, "GET", "/api/me", null, java.util.Map.of("Authorization", "Basic abc"));
    assertThat(bare.status()).isEqualTo(401);
  }

  @Test
  void AC_001_02_meCreatesTheUserOnce() {
    String uid = Tokens.randomUid();
    String token = Tokens.emulator(uid, "Mojca@Example.si", false, "Mojca Kranjc");
    Api.Res first = api.get(token, "/api/me");
    Api.Res second = api.get(token, "/api/me");
    assertThat(first.status()).isEqualTo(200);
    assertThat(second.json().get("id").asText()).isEqualTo(first.json().get("id").asText());
    assertThat(first.json().get("email").asText()).isEqualTo("Mojca@Example.si");
    assertThat(first.json().get("emailVerified").asBoolean()).isFalse();
    assertThat(first.json().get("displayName").asText()).isEqualTo("Mojca Kranjc");
  }

  @Test
  void AC_001_03_meKeepsEmailVerifiedFlagAndDisplayNameCurrent() {
    String uid = Tokens.randomUid();
    String id = api.get(Tokens.emulator(uid, "old@example.si", false, "Old"), "/api/me").json().get("id").asText();
    Api.Res r = api.get(Tokens.emulator(uid, "new@example.si", true, "Žiga Čeh"), "/api/me");
    assertThat(r.json().get("id").asText()).isEqualTo(id);
    assertThat(r.json().get("email").asText()).isEqualTo("new@example.si");
    assertThat(r.json().get("emailVerified").asBoolean()).isTrue();
    assertThat(r.json().get("displayName").asText()).isEqualTo("Žiga Čeh");
  }

  @Test
  void healthAndReadinessNeedNoToken() {
    assertThat(api.get(null, "/api/health").status()).isEqualTo(200);
    assertThat(api.get(null, "/api/health/ready").status()).isEqualTo(200);
  }

  @Test
  void SR_05_bodiesLargerThanOneMegabyteGet413() {
    TestUser u = user("Big");
    String big = "{\"name\":\"" + "x".repeat(1_100_000) + "\"}";
    Api.Res r = api.post(u.token(), "/api/workspaces", big);
    assertThat(r.status()).isEqualTo(413);
  }

  @Test
  void securityHeadersAreSet() {
    Api.Res r = api.get(null, "/api/health");
    assertThat(r.header("X-Content-Type-Options")).isEqualTo("nosniff");
    assertThat(r.header("X-Frame-Options")).isEqualTo("DENY");
    assertThat(r.header("Cache-Control")).contains("no-store");
  }
}
