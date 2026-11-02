package si.contacts.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.mock.env.MockEnvironment;

class ProductionGuardTest {

  static GenericApplicationContext ctx(String profile, String... props) {
    MockEnvironment env = new MockEnvironment();
    if (profile != null) env.setActiveProfiles(profile);
    for (int i = 0; i < props.length; i += 2) env.setProperty(props[i], props[i + 1]);
    GenericApplicationContext c = new GenericApplicationContext();
    c.setEnvironment(env);
    return c;
  }

  @Test
  void outsideProductionNothingIsChecked() {
    assertThatCode(() -> new ProductionGuard().initialize(ctx(null, "app.auth.emulator", "true"))).doesNotThrowAnyException();
    assertThatCode(() -> new ProductionGuard().initialize(ctx("local", "app.auth.project-id", "demo-x"))).doesNotThrowAnyException();
  }

  @Test
  void productionNeedsARealProjectAndNoEmulator() {
    ProductionGuard g = new ProductionGuard();
    assertThatCode(() -> g.initialize(ctx("prod", "app.auth.project-id", "kontakti-prod", "app.auth.emulator", "false"))).doesNotThrowAnyException();
    assertThatCode(() -> g.initialize(ctx("prod", "app.auth.project-id", "kontakti-prod"))).doesNotThrowAnyException();
    assertThatThrownBy(() -> g.initialize(ctx("prod", "app.auth.project-id", "kontakti-prod", "app.auth.emulator", "true")))
        .hasMessage("Refusing to start in production: the Auth emulator is configured");
    assertThatThrownBy(() -> g.initialize(ctx("prod", "app.auth.project-id", "kontakti-prod", "FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")))
        .hasMessage("Refusing to start in production: the Auth emulator is configured");
    assertThatCode(() -> g.initialize(ctx("prod", "app.auth.project-id", "kontakti-prod", "FIREBASE_AUTH_EMULATOR_HOST", " "))).doesNotThrowAnyException();
    assertThatThrownBy(() -> g.initialize(ctx("prod", "app.auth.project-id", "  ")))
        .hasMessage("Refusing to start in production: no Firebase project id is configured");
    assertThatThrownBy(() -> g.initialize(ctx("prod")))
        .hasMessage("Refusing to start in production: no Firebase project id is configured");
    assertThatThrownBy(() -> g.initialize(ctx("prod", "app.auth.project-id", "demo-kontakti")))
        .hasMessage("Refusing to start in production: a demo- project id is configured");
  }
}
