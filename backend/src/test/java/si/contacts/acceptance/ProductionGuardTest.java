package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import si.contacts.ContactsApplication;

/** SR-02, DoD-P06: production refuses to start with emulator settings. */
class ProductionGuardTest {

  @ParameterizedTest
  @CsvSource({"true,real-project", "false,demo-contacts", "false,''"})
  void productionRefusesEmulatorSettings(String emulator, String project) {
    assertThatThrownBy(
            () ->
                new SpringApplicationBuilder(ContactsApplication.class)
                    .profiles("prod")
                    .properties(
                        "app.auth.emulator=" + emulator,
                        "app.auth.project-id=" + project,
                        "spring.main.web-application-type=none")
                    .run())
        .hasStackTraceContaining("Refusing to start in production");
  }
}
