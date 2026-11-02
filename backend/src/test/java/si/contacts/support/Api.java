package si.contacts.support;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Thin HTTP client for the REST seam: real requests against the running backend. */
public final class Api {
  static final ObjectMapper JSON = JsonMapper.builder().build();
  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private final String base;

  public Api(int port) {
    this.base = "http://localhost:" + port;
  }

  public Res get(String token, String path) {
    return send(token, "GET", path, null);
  }

  public Res post(String token, String path, Object body) {
    return send(token, "POST", path, body);
  }

  public Res put(String token, String path, Object body) {
    return send(token, "PUT", path, body);
  }

  public Res patch(String token, String path, Object body) {
    return send(token, "PATCH", path, body);
  }

  public Res delete(String token, String path) {
    return send(token, "DELETE", path, null);
  }

  public Res delete(String token, String path, Object body) {
    return send(token, "DELETE", path, body);
  }

  public Res send(String token, String method, String path, Object body) {
    try {
      String raw = body == null ? null : body instanceof String s ? s : JSON.writeValueAsString(body);
      return sendRaw(token, method, path, raw, Map.of());
    } catch (RuntimeException e) {
      throw e;
    }
  }

  public Res sendRaw(String token, String method, String path, String raw, Map<String, String> headers) {
    try {
      HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + path));
      if (token != null) b.header("Authorization", "Bearer " + token);
      headers.forEach(b::header);
      if (raw != null) {
        b.header("Content-Type", "application/json");
        b.method(method, HttpRequest.BodyPublishers.ofString(raw));
      } else {
        b.method(method, HttpRequest.BodyPublishers.noBody());
      }
      HttpResponse<byte[]> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
      return new Res(r.statusCode(), r.body(), r.headers().map());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public record Res(int status, byte[] bytes, Map<String, java.util.List<String>> headers) {
    public JsonNode json() {
      return bytes.length == 0 ? JSON.missingNode() : JSON.readTree(bytes);
    }

    public String body() {
      return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    }

    public String header(String name) {
      return headers.entrySet().stream()
          .filter(e -> e.getKey().equalsIgnoreCase(name))
          .map(e -> e.getValue().get(0))
          .findFirst()
          .orElse(null);
    }

    @Override
    public String toString() {
      return status + " " + body();
    }
  }
}
