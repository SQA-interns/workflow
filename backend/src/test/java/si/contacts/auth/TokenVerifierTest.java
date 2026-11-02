package si.contacts.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class TokenVerifierTest {
  static final String P = "demo-unit";
  final TokenVerifier emulator = verifier(true, P);

  static TokenVerifier verifier(boolean emulator, String project) {
    try {
      return new TokenVerifier(new AuthProperties(project, emulator, "http://127.0.0.1:9/jwks"));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  static String token(String payload) {
    Base64.Encoder b = Base64.getUrlEncoder().withoutPadding();
    return b.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
        + b.encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + ".";
  }

  static String claims(String aud, String iss, long iat, long exp, String sub, String extra) {
    return "{\"aud\":\"" + aud + "\",\"iss\":\"" + iss + "\",\"iat\":" + iat + ",\"exp\":" + exp
        + (sub == null ? "" : ",\"sub\":\"" + sub + "\"") + extra + "}";
  }

  static final String ISS = "https://securetoken.google.com/" + P;
  static long now() {
    return Instant.now().getEpochSecond();
  }

  @Test
  void anEmulatorTokenYieldsTheIdentityWithANameOfAtMost200Characters() throws Exception {
    String name = "Č".repeat(205);
    VerifiedIdentity id = emulator.verify(token(claims(P, ISS, now(), now() + 60, "u1",
        ",\"email\":\"a@b.si\",\"email_verified\":true,\"name\":\"" + name + "\"")));
    assertThat(id).isEqualTo(new VerifiedIdentity("u1", "a@b.si", true, "Č".repeat(200)));
    VerifiedIdentity plain = emulator.verify(token(claims(P, ISS, now(), now() + 60, "u2", ",\"name\":\"" + "x".repeat(200) + "\"")));
    assertThat(plain).isEqualTo(new VerifiedIdentity("u2", null, false, "x".repeat(200)));
    assertThat(emulator.verify(token(claims(P, ISS, now(), now() + 60, "u3", ""))).displayName()).isNull();
  }

  @Test
  void expiryAndIssueTimeAllowOneMinuteOfClockSkew() throws Exception {
    assertThat(emulator.verify(token(claims(P, ISS, now(), now() - 50, "u", ""))).uid()).isEqualTo("u");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now(), now() - 70, "u", "")))).hasMessage("expired");
    assertThat(emulator.verify(token(claims(P, ISS, now() + 50, now() + 600, "u", ""))).uid()).isEqualTo("u");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now() + 70, now() + 600, "u", "")))).hasMessage("issued in the future");
  }

  @Test
  void wrongOrMissingClaimsAreRefused() {
    assertThatThrownBy(() -> emulator.verify(token(claims("other", ISS, now(), now() + 60, "u", "")))).hasMessage("audience");
    assertThatThrownBy(() -> emulator.verify(token("{\"iss\":\"" + ISS + "\",\"iat\":1,\"exp\":" + (now() + 60) + ",\"sub\":\"u\"}"))).hasMessage("audience");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, "https://x", now(), now() + 60, "u", "")))).hasMessage("issuer");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now(), now() + 60, null, "")))).hasMessage("subject");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now(), now() + 60, "", "")))).hasMessage("subject");
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now(), now() + 60, "u".repeat(129), "")))).hasMessage("subject");
    assertThat(catchUid(token(claims(P, ISS, now(), now() + 60, "u".repeat(128), ""))))
        .isEqualTo("u".repeat(128));
    assertThatThrownBy(() -> emulator.verify(token(claims(P, ISS, now(), now() + 60, "u", ",\"email\":5")))).hasMessage("claims");
    assertThatThrownBy(() -> emulator.verify(token("{\"aud\":\"" + P + "\",\"iss\":\"" + ISS + "\",\"exp\":" + (now() + 60) + ",\"sub\":\"u\"}")))
        .hasMessage("issued in the future");
    assertThatThrownBy(() -> emulator.verify(token("{\"aud\":\"" + P + "\",\"iss\":\"" + ISS + "\",\"iat\":1,\"sub\":\"u\"}"))).hasMessage("expired");
    assertThatThrownBy(() -> emulator.verify("nonsense")).hasMessage("invalid token");
  }

  String catchUid(String t) {
    try {
      return emulator.verify(t).uid();
    } catch (InvalidTokenException e) {
      return e.getMessage();
    }
  }

  @Test
  void withoutAProjectEveryTokenIsRefused() {
    TokenVerifier none = verifier(true, " ");
    assertThatThrownBy(() -> none.verify(token(claims(" ", "https://securetoken.google.com/ ", now(), now() + 60, "u", ""))))
        .hasMessage("no project");
    TokenVerifier nul = verifier(true, null);
    assertThatThrownBy(() -> nul.verify(token(claims(P, ISS, now(), now() + 60, "u", "")))).hasMessage("no project");
  }

  @Test
  void productionModeRefusesUnsignedTokensAndEmulatorModeRefusesSignedOnes() throws Exception {
    TokenVerifier prod = verifier(false, P);
    assertThatThrownBy(() -> prod.verify(token(claims(P, ISS, now(), now() + 60, "u", "")))).hasMessage("unsigned token");
    Base64.Encoder b = Base64.getUrlEncoder().withoutPadding();
    String signed = b.encodeToString("{\"alg\":\"HS256\"}".getBytes(StandardCharsets.UTF_8)) + "."
        + b.encodeToString(claims(P, ISS, now(), now() + 60, "u", "").getBytes(StandardCharsets.UTF_8)) + ".c2ln";
    assertThatThrownBy(() -> emulator.verify(signed)).hasMessage("signed token in emulator mode");
    assertThatThrownBy(() -> prod.verify(signed)).hasMessage("invalid token");
  }

  @Test
  void anEncryptedTokenIsUnsupported() {
    String jwe = "eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00ifQ.a.b.c.d";
    assertThatThrownBy(() -> emulator.verify(jwe)).hasMessage("unsupported token");
  }
}
