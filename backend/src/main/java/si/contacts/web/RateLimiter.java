package si.contacts.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contacts.auth.AuthFilter;

/** Fixed one-minute window per signed-in User, or per client address before sign-in (SR-05). */
public class RateLimiter extends OncePerRequestFilter {
  private final int perMinute;
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

  public RateLimiter(int perMinute) {
    this.perMinute = perMinute;
  }

  private record Window(long minute, AtomicInteger count) {}

  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    if (Filters.isPublic(req)) {
      chain.doFilter(req, res);
      return;
    }
    Object uid = req.getAttribute(AuthFilter.UID_ATTRIBUTE);
    String key = uid != null ? "u:" + uid : "a:" + req.getRemoteAddr();
    long minute = System.currentTimeMillis() / 60_000;
    Window w =
        windows.compute(
            key, (k, old) -> old == null || old.minute != minute ? new Window(minute, new AtomicInteger()) : old);
    if (w.count.incrementAndGet() > perMinute) {
      res.setHeader("Retry-After", "60");
      Filters.writeError(res, 429, ErrorBody.json("too many requests"));
      return;
    }
    if (windows.size() > 100_000) windows.entrySet().removeIf(e -> e.getValue().minute != minute);
    chain.doFilter(req, res);
  }
}
