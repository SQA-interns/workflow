package si.contacts.workspace;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import si.contacts.auth.AuthFilter;
import si.contacts.user.User;
import si.contacts.web.ApiException;

/**
 * Answers a non-Member with 404 before anything else of the request is looked at (its body
 * included), so a non-Member can never tell a Workspace exists from a validation error.
 */
public class MembershipInterceptor implements HandlerInterceptor {
  private final WorkspaceAccess access;

  public MembershipInterceptor(WorkspaceAccess access) {
    this.access = access;
  }

  @Override
  public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
    @SuppressWarnings("unchecked")
    Map<String, String> vars = (Map<String, String>) req.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
    String wid = vars == null ? null : vars.get("wid");
    if (wid == null) return true;
    UUID id;
    try {
      id = UUID.fromString(wid);
    } catch (IllegalArgumentException e) {
      throw ApiException.notFound();
    }
    if (!(req.getAttribute(AuthFilter.USER_ATTRIBUTE) instanceof User user) || access.find(id, user).isEmpty())
      throw ApiException.notFound();
    return true;
  }
}
