package si.contacts.auth;

import java.util.Arrays;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * SR-02: in the {@code prod} profile the application refuses to start with the Auth emulator, a
 * {@code demo-} project id or no project id, before any bean is created.
 */
public class ProductionGuard implements ApplicationContextInitializer<ConfigurableApplicationContext> {
  @Override
  public void initialize(ConfigurableApplicationContext ctx) {
    ConfigurableEnvironment env = ctx.getEnvironment();
    if (!Arrays.asList(env.getActiveProfiles()).contains("prod")) return;
    String project = env.getProperty("app.auth.project-id", "").trim();
    boolean emulator = env.getProperty("app.auth.emulator", Boolean.class, false);
    boolean emulatorHost = !env.getProperty("FIREBASE_AUTH_EMULATOR_HOST", "").isBlank();
    if (emulator || emulatorHost) fail("the Auth emulator is configured");
    if (project.isEmpty()) fail("no Firebase project id is configured");
    if (project.startsWith("demo-")) fail("a demo- project id is configured");
  }

  private static void fail(String why) {
    throw new IllegalStateException("Refusing to start in production: " + why);
  }
}
