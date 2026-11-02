package si.contacts.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.BadJOSEException;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.JWTParser;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.MalformedURLException;
import java.net.URI;
import java.text.ParseException;
import java.time.Instant;
import java.util.Date;
import org.springframework.stereotype.Component;

/**
 * The one authentication adapter: verifies a Firebase ID token (signature, audience, issuer,
 * expiry) and yields the identity. No other code depends on Firebase.
 */
@Component
public class TokenVerifier {
  private static final long SKEW_SECONDS = 60;
  private final AuthProperties props;
  private final DefaultJWTProcessor<SecurityContext> processor;

  public TokenVerifier(AuthProperties props) throws MalformedURLException {
    this.props = props;
    this.processor = new DefaultJWTProcessor<>();
    if (!props.emulator()) {
      JWKSource<SecurityContext> keys = JWKSourceBuilder.create(URI.create(props.jwksUri()).toURL()).build();
      processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
      processor.setJWTClaimsSetVerifier((claims, ctx) -> {});
    }
  }

  public VerifiedIdentity verify(String token) throws InvalidTokenException {
    JWTClaimsSet claims;
    try {
      JWT jwt = JWTParser.parse(token);
      if (jwt instanceof PlainJWT plain) {
        if (!props.emulator()) throw new InvalidTokenException("unsigned token");
        claims = plain.getJWTClaimsSet();
      } else if (jwt instanceof SignedJWT signed) {
        if (props.emulator()) throw new InvalidTokenException("signed token in emulator mode");
        claims = processor.process(signed, null);
      } else {
        throw new InvalidTokenException("unsupported token");
      }
    } catch (ParseException | BadJOSEException | JOSEException e) {
      throw new InvalidTokenException("invalid token");
    }
    return check(claims);
  }

  private VerifiedIdentity check(JWTClaimsSet c) throws InvalidTokenException {
    String project = props.projectId();
    Instant now = Instant.now();
    if (project == null || project.isBlank()) throw new InvalidTokenException("no project");
    if (c.getAudience() == null || !c.getAudience().equals(java.util.List.of(project)))
      throw new InvalidTokenException("audience");
    if (!("https://securetoken.google.com/" + project).equals(c.getIssuer()))
      throw new InvalidTokenException("issuer");
    Date exp = c.getExpirationTime();
    if (exp == null || exp.toInstant().isBefore(now.minusSeconds(SKEW_SECONDS)))
      throw new InvalidTokenException("expired");
    Date iat = c.getIssueTime();
    if (iat == null || iat.toInstant().isAfter(now.plusSeconds(SKEW_SECONDS)))
      throw new InvalidTokenException("issued in the future");
    String sub = c.getSubject();
    if (sub == null || sub.isEmpty() || sub.length() > 128) throw new InvalidTokenException("subject");
    try {
      String email = c.getStringClaim("email");
      Boolean verified = c.getBooleanClaim("email_verified");
      String name = c.getStringClaim("name");
      return new VerifiedIdentity(
          sub, email, Boolean.TRUE.equals(verified), name == null ? null : truncate(name, 200));
    } catch (ParseException e) {
      throw new InvalidTokenException("claims");
    }
  }

  private static String truncate(String s, int max) {
    return s.length() <= max ? s : s.substring(0, max);
  }
}
