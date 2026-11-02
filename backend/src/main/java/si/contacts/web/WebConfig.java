package si.contacts.web;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import si.contacts.auth.AuthFilter;
import si.contacts.auth.CurrentUserResolver;
import si.contacts.auth.TokenVerifier;
import si.contacts.user.UserService;
import si.contacts.workspace.MembershipInterceptor;
import si.contacts.workspace.WorkspaceAccess;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final String[] allowedOrigins;
  private final WorkspaceAccess access;

  public WebConfig(@Value("${app.cors.allowed-origins:}") String origins, WorkspaceAccess access) {
    this.access = access;
    this.allowedOrigins = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    if (allowedOrigins.length > 0) {
      registry
          .addMapping("/api/**")
          .allowedOrigins(allowedOrigins)
          .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
          .allowedHeaders("Authorization", "Content-Type")
          .exposedHeaders("Content-Disposition");
    }
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(new MembershipInterceptor(access)).addPathPatterns("/api/workspaces/*", "/api/workspaces/*/**");
  }

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(new CurrentUserResolver());
  }

  @Bean
  FilterRegistrationBean<Filters.SecurityHeaders> securityHeadersFilter() {
    var b = new FilterRegistrationBean<>(new Filters.SecurityHeaders());
    b.setOrder(1);
    return b;
  }

  @Bean
  FilterRegistrationBean<Filters.BodySize> bodySizeFilter(@Value("${app.max-body-bytes}") long max) {
    var b = new FilterRegistrationBean<>(new Filters.BodySize(max));
    b.setOrder(2);
    return b;
  }

  @Bean
  FilterRegistrationBean<AuthFilter> authFilter(
      TokenVerifier verifier, UserService users, @Value("${app.rate-limit.per-address-per-minute}") int perAddress) {
    var b = new FilterRegistrationBean<>(new AuthFilter(verifier, users, new AddressLimiter(perAddress)));
    b.setOrder(3);
    return b;
  }

  @Bean
  FilterRegistrationBean<RateLimiter> rateLimitFilter(@Value("${app.rate-limit.requests-per-minute}") int perMinute) {
    var b = new FilterRegistrationBean<>(new RateLimiter(perMinute));
    b.setOrder(4);
    return b;
  }
}
