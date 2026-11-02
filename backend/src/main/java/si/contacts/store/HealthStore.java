package si.contacts.store;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class HealthStore {
  private final JdbcClient db;

  public HealthStore(JdbcClient db) {
    this.db = db;
  }

  public boolean databaseUp() {
    try {
      return db.sql("SELECT 1").query(Integer.class).single() == 1;
    } catch (RuntimeException e) {
      return false;
    }
  }
}
