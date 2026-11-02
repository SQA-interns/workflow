package si.contacts.web;

/** Input clean-up shared by all validations. */
public final class Text {
  private Text() {}

  /** Trims; a value of only whitespace becomes {@code null}. */
  public static String clean(Object value) {
    if (value == null) return null;
    String s = value.toString().strip();
    return s.isEmpty() ? null : s;
  }
}
