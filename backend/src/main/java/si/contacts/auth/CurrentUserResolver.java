package si.contacts.auth;

import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import si.contacts.user.User;

/** Injects the signed-in {@link User} into controller methods. */
public class CurrentUserResolver implements HandlerMethodArgumentResolver {
  @Override
  public boolean supportsParameter(MethodParameter p) {
    return p.getParameterType() == User.class;
  }

  @Override
  public Object resolveArgument(
      MethodParameter p, ModelAndViewContainer m, NativeWebRequest req, WebDataBinderFactory f) {
    Object u = req.getAttribute(AuthFilter.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
    if (u == null) throw new IllegalStateException("no signed-in user");
    return u;
  }
}
