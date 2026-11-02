package si.contacts.contact;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** Normalisation for search and Duplicate matching (case, diacritics, whitespace, phone digits). */
public final class Normalize {
  private static final Pattern MARKS = Pattern.compile("\\p{M}+");
  private static final Pattern SPACES = Pattern.compile("\\s+");

  private Normalize() {}

  /** Lower case, diacritics removed (also đ→d), whitespace collapsed; null stays null. */
  public static String text(String s) {
    if (s == null) return null;
    String n = Normalizer.normalize(s, Normalizer.Form.NFD);
    n = MARKS.matcher(n).replaceAll("");
    n = n.replace('đ', 'd').replace('Đ', 'D').replace('ł', 'l').replace('Ł', 'L').replace('ø', 'o').replace('Ø', 'O');
    n = n.toLowerCase(Locale.ROOT);
    return SPACES.matcher(n).replaceAll(" ").strip();
  }

  public static String email(String email) {
    return email == null ? null : email.strip().toLowerCase(Locale.ROOT);
  }

  /** Formatting removed, {@code 00} becomes {@code +}, digits only; fewer than 6 digits never match (null). */
  public static String phone(String phone) {
    if (phone == null) return null;
    String s = phone.replaceAll("[^0-9+]", "");
    boolean plus = s.startsWith("+");
    String digits = s.replaceAll("[^0-9]", "");
    if (!plus && digits.startsWith("00")) {
      plus = true;
      digits = digits.substring(2);
    }
    if (digits.length() < 6) return null;
    return (plus ? "+" : "") + digits;
  }

  /** First and last name together; needs both, otherwise null (a first name alone never matches). */
  public static String fullName(String first, String last) {
    String f = text(first);
    String l = text(last);
    if (f == null || l == null || f.isEmpty() || l.isEmpty()) return null;
    return f + " " + l;
  }

  /** The text the search box looks in: names, full name, email, phone, company and city. */
  public static String searchText(ContactState s) {
    StringBuilder b = new StringBuilder();
    String first = s.field("firstName");
    String last = s.field("lastName");
    append(b, text(first));
    append(b, text(last));
    if (first != null && last != null) append(b, text(first + " " + last));
    append(b, text(s.field("email")));
    String phone = s.field("phone");
    append(b, text(phone));
    if (phone != null) append(b, phone.replaceAll("[^0-9+]", ""));
    append(b, text(s.field("company")));
    append(b, text(s.field("city")));
    return b.toString();
  }

  private static void append(StringBuilder b, String s) {
    if (s == null || s.isEmpty()) return;
    b.append('\u0001').append(s);
  }

  /** Escapes a value for use inside a LIKE pattern with ESCAPE '\'. */
  public static String likeEscape(String s) {
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }
}
