package si.contacts.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import si.contacts.auth.CurrentUserResolver;
import si.contacts.auth.TokenVerifier;
import si.contacts.user.UserService;
import si.contacts.workspace.WorkspaceAccess;

class WebConfigTest {

  static class Registry extends CorsRegistry {
    java.util.Map<String, org.springframework.web.cors.CorsConfiguration> configs() {
      return getCorsConfigurations();
    }
  }

  @Test
  void corsIsOffByDefaultAndListsOnlyTheConfiguredOrigins() {
    Registry none = new Registry();
    new WebConfig(" , ", mock(WorkspaceAccess.class)).addCorsMappings(none);
    assertThat(none.configs()).isEmpty();
    Registry some = new Registry();
    new WebConfig("https://a.si, https://b.si", mock(WorkspaceAccess.class)).addCorsMappings(some);
    var cfg = some.configs().get("/api/**");
    assertThat(cfg.getAllowedOrigins()).containsExactly("https://a.si", "https://b.si");
    assertThat(cfg.getAllowedMethods()).containsExactly("GET", "POST", "PUT", "PATCH", "DELETE");
    assertThat(cfg.getExposedHeaders()).containsExactly("Content-Disposition");
  }

  @Test
  void filtersRunInOrderHeadersSizeAuthRate() {
    WebConfig c = new WebConfig("", mock(WorkspaceAccess.class));
    var headers = c.securityHeadersFilter();
    var size = c.bodySizeFilter(10);
    var auth = c.authFilter(mock(TokenVerifier.class), mock(UserService.class), 5);
    var rate = c.rateLimitFilter(5);
    assertThat(List.of(headers.getOrder(), size.getOrder(), auth.getOrder(), rate.getOrder())).containsExactly(1, 2, 3, 4);
    assertThat(headers.getFilter()).isInstanceOf(Filters.SecurityHeaders.class);
    assertThat(size.getFilter()).isInstanceOf(Filters.BodySize.class);
    assertThat(auth.getFilter()).isNotNull();
    assertThat(rate.getFilter()).isInstanceOf(RateLimiter.class);
    List<HandlerMethodArgumentResolver> resolvers = new ArrayList<>();
    c.addArgumentResolvers(resolvers);
    assertThat(resolvers).hasOnlyElementsOfType(CurrentUserResolver.class).hasSize(1);
  }
}
