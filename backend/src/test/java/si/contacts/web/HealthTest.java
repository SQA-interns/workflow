package si.contacts.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import si.contacts.store.HealthStore;

class HealthTest {
  @Test
  void readinessIs503WhenTheDatabaseIsDown() {
    HealthStore store = mock(HealthStore.class);
    when(store.databaseUp()).thenReturn(false);
    var r = new HealthController(store).ready();
    assertThat(r.getStatusCode().value()).isEqualTo(503);
    assertThat(r.getBody()).containsEntry("status", "DOWN");
  }

  @Test
  void theDatabaseCheckReportsAFailureAsDown() {
    JdbcClient db = mock(JdbcClient.class);
    when(db.sql("SELECT 1")).thenThrow(new IllegalStateException("down"));
    assertThat(new HealthStore(db).databaseUp()).isFalse();
  }
}
