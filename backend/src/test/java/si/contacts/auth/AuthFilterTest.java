package si.contacts.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.ServletWebRequest;
import si.contacts.user.User;
import si.contacts.user.UserService;
import si.contacts.web.AddressLimiter;

class AuthFilterTest {
  final TokenVerifier verifier = mock(TokenVerifier.class);
  final UserService users = mock(UserService.class);
  final User ana = new User(UUID.randomUUID(), "uid1", "a@b.si", true, "Ana");

  record Result(MockHttpServletRequest req, MockHttpServletResponse res, MockFilterChain chain) {}

  Result call(AuthFilter f, String method, String path, String auth) throws Exception {
    MockHttpServletRequest req = new MockHttpServletRequest(method, path);
    req.setRemoteAddr("1.2.3.4");
    if (auth != null) req.addHeader("Authorization", auth);
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    f.doFilter(req, res, chain);
    return new Result(req, res, chain);
  }

  @Test
  void aValidTokenResolvesTheUserAndContinues() throws Exception {
    when(verifier.verify("tok")).thenReturn(new VerifiedIdentity("uid1", "a@b.si", true, "Ana"));
    when(users.signIn(any())).thenReturn(ana);
    Result r = call(new AuthFilter(verifier, users, new AddressLimiter(5)), "GET", "/api/me", "Bearer  tok ");
    assertThat(r.chain().getRequest()).isNotNull();
    assertThat(r.req().getAttribute(AuthFilter.USER_ATTRIBUTE)).isEqualTo(ana);
    assertThat(r.req().getAttribute(AuthFilter.UID_ATTRIBUTE)).isEqualTo("uid1");
  }

  @Test
  void missingMalformedOrTooLongHeadersGet401WithoutVerifying() throws Exception {
    AuthFilter f = new AuthFilter(verifier, users, new AddressLimiter(100));
    for (String header : new String[] {null, "Basic x", "Bearer", "Bearer " + "x".repeat(8186)}) {
      Result r = call(f, "GET", "/api/me", header);
      assertThat(r.res().getStatus()).as(String.valueOf(header).length() + "").isEqualTo(401);
      assertThat(r.res().getHeader("WWW-Authenticate")).isEqualTo("Bearer");
      assertThat(r.res().getContentAsString()).contains("unauthorized");
      assertThat(r.chain().getRequest()).isNull();
    }
    verifyNoInteractions(verifier);
  }

  @Test
  void aHeaderOfExactly8192CharactersIsStillVerified() throws Exception {
    String token = "x".repeat(8192 - 7);
    when(verifier.verify(token)).thenThrow(new InvalidTokenException("bad"));
    Result r = call(new AuthFilter(verifier, users, new AddressLimiter(5)), "GET", "/api/me", "Bearer " + token);
    assertThat(r.res().getStatus()).isEqualTo(401);
    org.mockito.Mockito.verify(verifier).verify(token);
  }

  @Test
  void repeatedFailuresFromOneAddressGet429() throws Exception {
    when(verifier.verify(any())).thenThrow(new InvalidTokenException("bad"));
    AuthFilter f = new AuthFilter(verifier, users, new AddressLimiter(1));
    assertThat(call(f, "GET", "/api/me", "Bearer a").res().getStatus()).isEqualTo(401);
    Result r = call(f, "GET", "/api/me", "Bearer a");
    assertThat(r.res().getStatus()).isEqualTo(429);
    assertThat(r.res().getHeader("Retry-After")).isEqualTo("60");
  }

  @Test
  void publicPathsAndPreflightPassWithoutAToken() throws Exception {
    AuthFilter f = new AuthFilter(verifier, users, new AddressLimiter(1));
    assertThat(call(f, "GET", "/api/health", null).chain().getRequest()).isNotNull();
    assertThat(call(f, "OPTIONS", "/api/me", null).chain().getRequest()).isNotNull();
    verifyNoInteractions(verifier, users);
  }

  static void method(User u, String s) {}

  @Test
  void theCurrentUserResolverSuppliesOnlyUserParameters() throws Exception {
    CurrentUserResolver r = new CurrentUserResolver();
    var m = AuthFilterTest.class.getDeclaredMethod("method", User.class, String.class);
    assertThat(r.supportsParameter(new MethodParameter(m, 0))).isTrue();
    assertThat(r.supportsParameter(new MethodParameter(m, 1))).isFalse();
    MockHttpServletRequest req = new MockHttpServletRequest();
    req.setAttribute(AuthFilter.USER_ATTRIBUTE, ana);
    assertThat(r.resolveArgument(new MethodParameter(m, 0), null, new ServletWebRequest(req), null)).isEqualTo(ana);
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> r.resolveArgument(new MethodParameter(m, 0), null, new ServletWebRequest(new MockHttpServletRequest()), null))
        .isInstanceOf(IllegalStateException.class);
  }
}
