package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import si.contacts.support.ApiTestBase;

/** SR-05: requests without a valid token are rate limited per client address. */
@TestPropertySource(properties = "app.rate-limit.per-address-per-minute=5")
class AddressRateLimitApiTest extends ApiTestBase {

  @Test
  void requestsWithoutAValidTokenOverTheAddressLimitGet429() {
    int last = 0;
    for (int i = 0; i < 6; i++) last = api.get("not-a-token", "/api/workspaces").status();
    assertThat(last).isEqualTo(429);
    assertThat(api.get(null, "/api/health").status()).isEqualTo(200);
  }
}
