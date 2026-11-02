package si.contacts.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import si.contacts.auth.AuthFilter;

class LimitersTest {

  @Test
  void addressLimiterAllowsExactlyTheLimitPerAddress() {
    AddressLimiter l = new AddressLimiter(2);
    assertThat(l.overLimitAfterFailure("a")).isFalse();
    assertThat(l.overLimitAfterFailure("a")).isFalse();
    assertThat(l.overLimitAfterFailure("a")).isTrue();
    assertThat(l.overLimitAfterFailure("b")).isFalse();
  }

  static MockHttpServletResponse call(RateLimiter r, String path, String uid, String addr) throws Exception {
    MockHttpServletRequest req = new MockHttpServletRequest("GET", path);
    req.setRemoteAddr(addr);
    if (uid != null) req.setAttribute(AuthFilter.UID_ATTRIBUTE, uid);
    MockHttpServletResponse res = new MockHttpServletResponse();
    r.doFilter(req, res, new MockFilterChain());
    return res;
  }

  @Test
  void rateLimiterAllowsExactlyTheLimitPerUserThen429WithRetryAfter() throws Exception {
    RateLimiter r = new RateLimiter(2);
    assertThat(call(r, "/api/me", "u1", "1.1.1.1").getStatus()).isEqualTo(200);
    assertThat(call(r, "/api/me", "u1", "1.1.1.1").getStatus()).isEqualTo(200);
    MockHttpServletResponse third = call(r, "/api/me", "u1", "1.1.1.1");
    assertThat(third.getStatus()).isEqualTo(429);
    assertThat(third.getHeader("Retry-After")).isEqualTo("60");
    assertThat(third.getContentAsString()).contains("too many requests");
    assertThat(call(r, "/api/me", "u2", "1.1.1.1").getStatus()).isEqualTo(200);
  }

  @Test
  void rateLimiterKeysByAddressWithoutAUserAndNeverLimitsPublicPaths() throws Exception {
    RateLimiter r = new RateLimiter(1);
    assertThat(call(r, "/api/me", null, "2.2.2.2").getStatus()).isEqualTo(200);
    assertThat(call(r, "/api/me", null, "2.2.2.2").getStatus()).isEqualTo(429);
    assertThat(call(r, "/api/me", null, "3.3.3.3").getStatus()).isEqualTo(200);
    assertThat(call(r, "/api/me", "2.2.2.2", "9.9.9.9").getStatus()).isEqualTo(200);
    for (int i = 0; i < 3; i++) assertThat(call(r, "/api/health", null, "2.2.2.2").getStatus()).isEqualTo(200);
  }
}
