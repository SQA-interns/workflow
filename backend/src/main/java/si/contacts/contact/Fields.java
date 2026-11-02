package si.contacts.contact;

import java.util.List;
import java.util.Map;

/** The Predefined fields of a Contact, their limits and columns. */
public final class Fields {
  private Fields() {}

  public static final List<String> PREDEFINED =
      List.of(
          "firstName", "lastName", "email", "phone", "company", "jobTitle", "street", "postalCode", "city", "country", "note");

  public static final Map<String, Integer> MAX_LENGTH =
      Map.ofEntries(
          Map.entry("firstName", 100),
          Map.entry("lastName", 100),
          Map.entry("email", 254),
          Map.entry("phone", 50),
          Map.entry("company", 200),
          Map.entry("jobTitle", 200),
          Map.entry("street", 200),
          Map.entry("postalCode", 20),
          Map.entry("city", 100),
          Map.entry("country", 2),
          Map.entry("note", 2000));

  public static final Map<String, String> COLUMN =
      Map.ofEntries(
          Map.entry("firstName", "first_name"),
          Map.entry("lastName", "last_name"),
          Map.entry("email", "email"),
          Map.entry("phone", "phone"),
          Map.entry("company", "company"),
          Map.entry("jobTitle", "job_title"),
          Map.entry("street", "street"),
          Map.entry("postalCode", "postal_code"),
          Map.entry("city", "city"),
          Map.entry("country", "country"),
          Map.entry("note", "note"));
}
