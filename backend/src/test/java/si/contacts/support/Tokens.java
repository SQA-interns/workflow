package si.contacts.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * Builds ID tokens in exactly the shape the Firebase Auth Emulator issues: unsigned ({@code
 * alg: none}), audience = project id, issuer = securetoken.google.com/project.
 */
public final class Tokens {
  public static final String PROJECT = "demo-contacts-test";

  private Tokens() {}

  public static String emulator(String uid, String email, boolean verified, String name) {
    return emulator(PROJECT, uid, email, verified, name, Instant.now().plusSeconds(3600));
  }

  public static String emulator(
      String project, String uid, String email, boolean verified, String name, Instant exp) {
    long now = Instant.now().getEpochSecond();
    String header = "{\"alg\":\"none\",\"typ\":\"JWT\"}";
    String payload =
        "{\"iss\":\"https://securetoken.google.com/"
            + project
            + "\",\"aud\":\""
            + project
            + "\",\"auth_time\":"
            + (now - 10)
            + ",\"user_id\":\""
            + uid
            + "\",\"sub\":\""
            + uid
            + "\",\"iat\":"
            + (now - 10)
            + ",\"exp\":"
            + exp.getEpochSecond()
            + (email == null ? "" : ",\"email\":\"" + email + "\"")
            + ",\"email_verified\":"
            + verified
            + (name == null ? "" : ",\"name\":\"" + name + "\"")
            + ",\"firebase\":{\"sign_in_provider\":\"password\"}}";
    return b64(header) + "." + b64(payload) + ".";
  }

  public static String randomUid() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 28);
  }

  static String b64(String s) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(s.getBytes(StandardCharsets.UTF_8));
  }
}
