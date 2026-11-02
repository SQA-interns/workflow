package si.contacts.store;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contacts.user.User;

/** Users are not Workspace-owned; they are known by their sign-in identity. */
@Repository
public class UserStore {
  private final JdbcClient db;

  public UserStore(JdbcClient db) {
    this.db = db;
  }

  public User upsert(String uid, String email, boolean verified, String name) {
    return db.sql(
            "INSERT INTO users (id, firebase_uid, email, email_lower, email_verified, display_name)"
                + " VALUES (?, ?, ?, ?, ?, ?)"
                + " ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email,"
                + " email_lower = EXCLUDED.email_lower, email_verified = EXCLUDED.email_verified,"
                + " display_name = EXCLUDED.display_name"
                + " RETURNING id, firebase_uid, email, email_verified, display_name")
        .params(UUID.randomUUID(), uid, email, email == null ? null : email.toLowerCase(Locale.ROOT), verified, name)
        .query(UserStore::map)
        .single();
  }

  public Optional<User> findVerifiedByEmail(String emailLower) {
    return db.sql(
            "SELECT id, firebase_uid, email, email_verified, display_name FROM users"
                + " WHERE email_lower = ? AND email_verified ORDER BY created_at LIMIT 1")
        .param(emailLower)
        .query(UserStore::map)
        .optional();
  }

  static User map(ResultSet rs, int i) throws SQLException {
    return new User(
        rs.getObject("id", UUID.class),
        rs.getString("firebase_uid"),
        rs.getString("email"),
        rs.getBoolean("email_verified"),
        rs.getString("display_name"));
  }
}
