package si.contacts.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contacts.user.User;
import si.contacts.user.UserService;
import si.contacts.web.AddressLimiter;
import si.contacts.web.ErrorBody;
import si.contacts.web.Filters;

/** Requires a valid token on every API request except health; resolves the caller's User. */
public class AuthFilter extends OncePerRequestFilter {
  public static final String USER_ATTRIBUTE = "si.contacts.user";
  public static final String UID_ATTRIBUTE = "si.contacts.uid";
  private final TokenVerifier verifier;
  private final UserService users;
  private final AddressLimiter failures;

  public AuthFilter(TokenVerifier verifier, UserService users, AddressLimiter failures) {
    this.verifier = verifier;
    this.users = users;
    this.failures = failures;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    if (Filters.isPublic(req) || "OPTIONS".equals(req.getMethod())) {
      chain.doFilter(req, res);
      return;
    }
    String header = req.getHeader("Authorization");
    if (header == null || !header.startsWith("Bearer ") || header.length() > 8192) {
      refuse(req, res);
      return;
    }
    VerifiedIdentity identity;
    try {
      identity = verifier.verify(header.substring(7).trim());
    } catch (InvalidTokenException e) {
      refuse(req, res);
      return;
    }
    req.setAttribute(UID_ATTRIBUTE, identity.uid());
    User user = users.signIn(identity);
    req.setAttribute(USER_ATTRIBUTE, user);
    chain.doFilter(req, res);
  }

  /** 401, or 429 once the client address has failed too often this minute. */
  private void refuse(HttpServletRequest req, HttpServletResponse res) throws IOException {
    if (failures.overLimitAfterFailure(req.getRemoteAddr())) {
      res.setHeader("Retry-After", "60");
      Filters.writeError(res, 429, ErrorBody.json("too many requests"));
      return;
    }
    unauthorized(res);
  }

  private static void unauthorized(HttpServletResponse res) throws IOException {
    res.setHeader("WWW-Authenticate", "Bearer");
    Filters.writeError(res, 401, ErrorBody.json("unauthorized"));
  }
}
