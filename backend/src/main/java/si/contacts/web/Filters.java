package si.contacts.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.web.filter.OncePerRequestFilter;

/** Small servlet filters shared by the API: security headers and the body size limit. */
public final class Filters {
  private Filters() {}

  public static void writeError(HttpServletResponse res, int status, String json) throws IOException {
    res.setStatus(status);
    res.setContentType("application/json");
    res.setCharacterEncoding("UTF-8");
    res.getOutputStream().write(json.getBytes(StandardCharsets.UTF_8));
  }

  public static boolean isPublic(HttpServletRequest req) {
    String p = req.getRequestURI();
    return !p.startsWith("/api/") || p.equals("/api/health") || p.equals("/api/health/ready");
  }

  /** Security headers on every response (ASVS V3/V14). */
  public static class SecurityHeaders extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
        throws ServletException, IOException {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      chain.doFilter(req, res);
    }
  }

  /** Refuses request bodies over the limit with 413 (SR-05). */
  public static class BodySize extends OncePerRequestFilter {
    private final long max;

    public BodySize(long max) {
      this.max = max;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
        throws ServletException, IOException {
      if (req.getContentLengthLong() > max) {
        writeError(res, 413, ErrorBody.json("request body too large"));
        return;
      }
      chain.doFilter(new Limited(req, max), res);
    }
  }

  static final class Limited extends HttpServletRequestWrapper {
    private final long max;

    Limited(HttpServletRequest req, long max) {
      super(req);
      this.max = max;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
      ServletInputStream in = super.getInputStream();
      return new ServletInputStream() {
        long read;

        @Override
        public int read() throws IOException {
          int b = in.read();
          if (b >= 0 && ++read > max) throw new PayloadTooLargeException();
          return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
          int n = in.read(buf, off, len);
          if (n > 0 && (read += n) > max) throw new PayloadTooLargeException();
          return n;
        }

        @Override
        public boolean isFinished() {
          return in.isFinished();
        }

        @Override
        public boolean isReady() {
          return in.isReady();
        }

        @Override
        public void setReadListener(ReadListener l) {
          in.setReadListener(l);
        }
      };
    }
  }
}
