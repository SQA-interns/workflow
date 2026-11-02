package si.contacts.web;

import java.util.regex.Pattern;

/** A pragmatic email check: one @, a dotted domain, no whitespace, at most 254 characters. */
public final class Emails {
  private static final Pattern EMAIL =
      Pattern.compile("^[^@\\s\"(),:;<>\\[\\\\\\]]+@[^@\\s\"(),:;<>\\[\\\\\\]]+\\.[^@\\s\"(),:;<>\\[\\\\\\].]{2,}$");
  public static final int MAX = 254;

  private Emails() {}

  public static boolean valid(String email) {
    return email != null && email.length() <= MAX && EMAIL.matcher(email).matches() && !email.contains("..");
  }
}
