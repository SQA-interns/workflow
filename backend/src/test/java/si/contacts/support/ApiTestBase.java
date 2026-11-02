package si.contacts.support;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;

/** Base for acceptance tests through the REST API against a real PostgreSQL. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.context.TestPropertySource(properties = {"app.rate-limit.requests-per-minute=1000000", "app.auth.emulator=true", "app.auth.project-id=" + Tokens.PROJECT})
public abstract class ApiTestBase {
  static final PostgreSQLContainer DB = new PostgreSQLContainer("postgres:16.15-alpine");

  static {
    DB.start();
  }

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", DB::getJdbcUrl);
    r.add("spring.datasource.username", DB::getUsername);
    r.add("spring.datasource.password", DB::getPassword);
  }

  @LocalServerPort protected int port;
  protected Api api;

  @BeforeEach
  void setUpApi() {
    api = new Api(port);
  }

  /** A signed-in, verified User with a fresh identity. */
  protected TestUser user(String name) {
    String uid = Tokens.randomUid();
    String email = name.toLowerCase().replaceAll("[^a-z0-9]", "") + "." + uid.substring(0, 8) + "@example.si";
    TestUser u = new TestUser(uid, email, Tokens.emulator(uid, email, true, name));
    api.get(u.token(), "/api/me");
    return u;
  }

  protected String createWorkspace(TestUser owner, String name) {
    Api.Res r = api.post(owner.token(), "/api/workspaces", Map.of("name", name));
    if (r.status() != 201) throw new AssertionError(r.toString());
    return r.json().get("id").asText();
  }

  /** Adds an existing verified User to a Workspace with the Role. */
  protected void addMember(TestUser owner, String wid, TestUser member, String role) {
    Api.Res r =
        api.post(
            owner.token(),
            "/api/workspaces/" + wid + "/members",
            Map.of("email", member.email(), "role", role));
    if (r.status() != 201) throw new AssertionError(r.toString());
  }

  protected JsonNode createContact(TestUser editor, String wid, Map<String, Object> body) {
    Api.Res r = api.post(editor.token(), "/api/workspaces/" + wid + "/contacts", body);
    if (r.status() != 201) throw new AssertionError(r.toString());
    return r.json();
  }

  protected static Map<String, Object> contact(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
    return m;
  }

  protected static List<String> errorFields(Api.Res r) {
    return r.json().get("errors").valueStream().map(e -> e.get("field").asText(null)).toList();
  }

  public record TestUser(String uid, String email, String token) {}
}
