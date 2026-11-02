package si.contacts.support;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.ImageFromDockerfile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Firebase Auth Emulator of the Compose stack (built from {@code auth-emulator/}) in a test
 * container. Tests get real emulator ID tokens from it through its REST API.
 */
public final class AuthEmulator {
  public static final String PASSWORD = "geslo-123456";
  private static final ObjectMapper JSON = JsonMapper.builder().build();
  private static final HttpClient HTTP = HttpClient.newHttpClient();
  @SuppressWarnings("resource")
  private static final GenericContainer<?> CONTAINER =
      new GenericContainer<>(
              new ImageFromDockerfile("contacts-auth-emulator-test", false)
                  .withFileFromPath(".", Path.of("..", "auth-emulator").toAbsolutePath().normalize()))
          .withEnv("FIREBASE_PROJECT_ID", Tokens.PROJECT)
          .withExposedPorts(9099)
          .waitingFor(Wait.forHttp("/").forPort(9099).forStatusCode(200));

  static {
    CONTAINER.start();
  }

  private AuthEmulator() {}

  static String base() {
    return "http://" + CONTAINER.getHost() + ":" + CONTAINER.getMappedPort(9099) + "/identitytoolkit.googleapis.com/v1";
  }

  /** An emulator account: its uid and a fresh ID token. */
  public record Account(String uid, String email, String token) {}

  /** Signs up a new account, sets display name and verified flag, and signs in for a token with them. */
  public static Account signUp(String email, String displayName, boolean verified) {
    JsonNode r = post("/accounts:signUp?key=demo-api-key", Map.of("email", email, "password", PASSWORD, "returnSecureToken", true), false);
    String uid = r.get("localId").asText();
    update(uid, null, displayName, verified);
    return signIn(email);
  }

  /** Changes email, display name or verified flag (null leaves a value as it is), like the Firebase console. */
  public static void update(String uid, String email, String displayName, Boolean verified) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("localId", uid);
    if (email != null) body.put("email", email);
    if (displayName != null) body.put("displayName", displayName);
    if (verified != null) body.put("emailVerified", verified);
    post("/accounts:update?key=demo-api-key", body, true);
  }

  /** Signs in with the password and returns a fresh ID token. */
  public static Account signIn(String email) {
    JsonNode r = post("/accounts:signInWithPassword?key=demo-api-key", Map.of("email", email, "password", PASSWORD, "returnSecureToken", true), false);
    return new Account(r.get("localId").asText(), r.get("email").asText(), r.get("idToken").asText());
  }

  private static JsonNode post(String path, Map<String, Object> body, boolean owner) {
    try {
      HttpRequest.Builder b =
          HttpRequest.newBuilder(URI.create(base() + path))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
      if (owner) b.header("Authorization", "Bearer owner");
      HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 200) throw new IllegalStateException("emulator " + path + ": " + r.statusCode() + " " + r.body());
      return JSON.readTree(r.body());
    } catch (java.io.IOException e) {
      throw new IllegalStateException(e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }
}
