package si.contacts.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class FiltersTest {

  @Test
  void writeErrorWritesStatusJsonAndUtf8() throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    Filters.writeError(res, 418, ErrorBody.json("čaj"));
    assertThat(res.getStatus()).isEqualTo(418);
    assertThat(res.getContentType()).startsWith("application/json");
    assertThat(res.getCharacterEncoding()).isEqualTo("UTF-8");
    assertThat(res.getContentAsString(StandardCharsets.UTF_8)).isEqualTo("{\"errors\":[{\"field\":null,\"message\":\"čaj\"}]}");
  }

  @Test
  void onlyHealthAndNonApiPathsArePublic() {
    assertThat(Filters.isPublic(new MockHttpServletRequest("GET", "/api/health"))).isTrue();
    assertThat(Filters.isPublic(new MockHttpServletRequest("GET", "/api/health/ready"))).isTrue();
    assertThat(Filters.isPublic(new MockHttpServletRequest("GET", "/index.html"))).isTrue();
    assertThat(Filters.isPublic(new MockHttpServletRequest("GET", "/api/me"))).isFalse();
    assertThat(Filters.isPublic(new MockHttpServletRequest("GET", "/api/healthx"))).isFalse();
  }

  @Test
  void securityHeadersAreSetOnEveryResponse() throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    new Filters.SecurityHeaders().doFilter(new MockHttpServletRequest("GET", "/api/me"), res, chain);
    assertThat(res.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
    assertThat(res.getHeader("X-Frame-Options")).isEqualTo("DENY");
    assertThat(res.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
    assertThat(res.getHeader("Cache-Control")).isEqualTo("no-store");
    assertThat(res.getHeader("Content-Security-Policy")).isEqualTo("default-src 'none'; frame-ancestors 'none'");
    assertThat(res.getHeader("Cross-Origin-Resource-Policy")).isEqualTo("same-origin");
    assertThat(chain.getRequest()).isNotNull();
  }

  @Test
  void bodySizeRefusesADeclaredLengthOverTheLimitAndPassesTheLimitItself() throws Exception {
    MockHttpServletRequest big = new MockHttpServletRequest("POST", "/api/x");
    big.setContent(new byte[11]);
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    new Filters.BodySize(10).doFilter(big, res, chain);
    assertThat(res.getStatus()).isEqualTo(413);
    assertThat(chain.getRequest()).isNull();

    MockHttpServletRequest ok = new MockHttpServletRequest("POST", "/api/x");
    ok.setContent(new byte[10]);
    MockFilterChain chain2 = new MockFilterChain();
    new Filters.BodySize(10).doFilter(ok, new MockHttpServletResponse(), chain2);
    assertThat(chain2.getRequest()).isNotNull();
    assertThat(((HttpServletRequest) chain2.getRequest()).getInputStream().readAllBytes()).hasSize(10);
  }

  static ServletInputStream limited(byte[] body, long max) throws Exception {
    MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/x");
    req.setContent(body);
    return new Filters.Limited(req, max).getInputStream();
  }

  @Test
  void aStreamedBodyMayReachTheLimitButNotPassIt() throws Exception {
    ServletInputStream exact = limited(new byte[] {1, 2, 3}, 3);
    assertThat(exact.read()).isEqualTo(1);
    assertThat(exact.read()).isEqualTo(2);
    assertThat(exact.read()).isEqualTo(3);
    assertThat(exact.read()).isEqualTo(-1);
    ServletInputStream over = limited(new byte[] {1, 2, 3, 4}, 3);
    over.read();
    over.read();
    over.read();
    assertThatThrownBy(over::read).isInstanceOf(PayloadTooLargeException.class);

    byte[] buf = new byte[8];
    ServletInputStream exactBuf = limited(new byte[] {1, 2, 3}, 3);
    assertThat(exactBuf.read(buf, 0, 2)).isEqualTo(2);
    assertThat(exactBuf.read(buf, 2, 6)).isEqualTo(1);
    assertThat(exactBuf.read(buf, 0, 8)).isEqualTo(-1);
    ServletInputStream overBuf = limited(new byte[] {1, 2, 3, 4}, 3);
    assertThat(overBuf.read(buf, 0, 2)).isEqualTo(2);
    assertThatThrownBy(() -> overBuf.read(buf, 0, 8)).isInstanceOf(PayloadTooLargeException.class);
  }

  @Test
  void theLimitedStreamDelegatesItsState() throws Exception {
    ServletInputStream in = limited(new byte[] {1}, 5);
    assertThat(in.isFinished()).isFalse();
    assertThat(in.isReady()).isTrue();
    in.read();
    in.read();
    assertThat(in.isFinished()).isTrue();
    ReadListener listener =
        new ReadListener() {
          public void onDataAvailable() {}

          public void onAllDataRead() {}

          public void onError(Throwable t) {}
        };
    assertThatThrownBy(() -> in.setReadListener(listener)).isInstanceOf(UnsupportedOperationException.class);
  }
}
