package si.contacts.contact;

import java.util.Comparator;
import java.util.Objects;

/** The list's default order: last name, then first name (normalised, absent last), then id. */
public final class ContactOrder {
  private ContactOrder() {}

  private static String key(Contact c, String field) {
    return Objects.requireNonNullElse(Normalize.text(c.state().field(field)), "￿");
  }

  public static final Comparator<Contact> DEFAULT =
      Comparator.comparing((Contact c) -> key(c, "lastName"))
          .thenComparing(c -> key(c, "firstName"))
          .thenComparing(c -> c.id().toString());
}
