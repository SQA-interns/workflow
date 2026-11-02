package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import si.contacts.support.ApiTestBase;

/** SR-05: rate limit per User. */
@TestPropertySource(properties = "app.rate-limit.requests-per-minute=5")
class RateLimitApiTest extends ApiTestBase {

  @Test
  void requestsOverTheLimitGet429() {
    TestUser u = user("Hitri"); // 1 request
    int last = 0;
    for (int i = 0; i < 6; i++) last = api.get(u.token(), "/api/workspaces").status();
    assertThat(last).isEqualTo(429);
    assertThat(api.get(null, "/api/health").status()).isEqualTo(200);
  }
}
