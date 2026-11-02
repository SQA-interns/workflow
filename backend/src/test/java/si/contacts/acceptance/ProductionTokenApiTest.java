package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contacts.support.ApiTestBase;
import si.contacts.support.Tokens;

/** DoD-P05: token verification with real signatures (production mode, test key endpoint). */
class ProductionTokenApiTest extends ApiTestBase {
  static final String PROJECT = "contacts-prod-test";
  static final RSAKey KEY;
  static final RSAKey OTHER_KEY;
  static final HttpServer JWKS;

  static {
    try {
      KEY = new RSAKeyGenerator(2048).keyID("k1").generate();
      OTHER_KEY = new RSAKeyGenerator(2048).keyID("k1").generate();
      JWKS = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
      byte[] body = new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
      JWKS.createContext(
          "/jwks",
          ex -> {
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
          });
      JWKS.start();
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  @DynamicPropertySource
  static void prodAuth(DynamicPropertyRegistry r) {
    r.add("app.auth.emulator", () -> "false");
    r.add("app.auth.project-id", () -> PROJECT);
    r.add("app.auth.jwks-uri", () -> "http://localhost:" + JWKS.getAddress().getPort() + "/jwks");
  }

  static String sign(RSAKey key, String aud, String iss, long expOffsetSeconds) throws Exception {
    long now = System.currentTimeMillis();
    JWTClaimsSet claims =
        new JWTClaimsSet.Builder()
            .subject(Tokens.randomUid())
            .audience(aud)
            .issuer(iss)
            .issueTime(new Date(now - 10_000))
            .claim("auth_time", (now - 10_000) / 1000)
            .expirationTime(new Date(now + expOffsetSeconds * 1000))
            .claim("email", "prod@example.si")
            .claim("email_verified", true)
            .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
    jwt.sign(new RSASSASigner(key));
    return jwt.serialize();
  }

  static final String ISS = "https://securetoken.google.com/" + PROJECT;

  @Test
  void aCorrectlySignedTokenIsAccepted() throws Exception {
    assertThat(api.get(sign(KEY, PROJECT, ISS, 600), "/api/me").status()).isEqualTo(200);
  }

  @Test
  void wrongAudienceIssuerExpiryOrSignatureAndUnsignedTokensAreRefused() throws Exception {
    assertThat(api.get(sign(KEY, "other", ISS, 600), "/api/me").status()).isEqualTo(401);
    assertThat(api.get(sign(KEY, PROJECT, "https://securetoken.google.com/other", 600), "/api/me").status())
        .isEqualTo(401);
    assertThat(api.get(sign(KEY, PROJECT, ISS, -60), "/api/me").status()).isEqualTo(401);
    assertThat(api.get(sign(OTHER_KEY, PROJECT, ISS, 600), "/api/me").status()).isEqualTo(401);
    String unsigned =
        Tokens.emulator(PROJECT, Tokens.randomUid(), "x@example.si", true, "X", java.time.Instant.now().plusSeconds(600));
    assertThat(api.get(unsigned, "/api/me").status()).isEqualTo(401);
  }
}
