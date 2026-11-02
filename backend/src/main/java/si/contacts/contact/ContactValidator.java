package si.contacts.contact;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import si.contacts.web.ApiException;
import si.contacts.web.Emails;
import si.contacts.web.FieldError;
import si.contacts.web.Text;

/**
 * Turns a request body into a valid {@link ContactState} or a 400 with every field error. Unknown
 * properties (ids, authors, versions of others) are ignored and never widen access.
 */
public final class ContactValidator {
  public static final int MAX_ATTRIBUTES = 100;
  public static final int MAX_ATTRIBUTE_VALUE = 500;
  public static final int MAX_TAGS = 50;
  public static final int MAX_TAG = 50;
  public static final Pattern KEY = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,49}$");
  private static final Set<String> COUNTRIES = Set.of(Locale.getISOCountries());
  private static final Set<String> RESERVED_KEYS = reserved();

  private ContactValidator() {}

  private static Set<String> reserved() {
    Set<String> s = new HashSet<>();
    Fields.PREDEFINED.forEach(f -> s.add(f.toLowerCase(Locale.ROOT)));
    s.add("id");
    s.add("tags");
    return Set.copyOf(s);
  }

  public static ContactState parse(Map<String, Object> body) {
    List<FieldError> errors = new ArrayList<>();
    Map<String, String> fields = new LinkedHashMap<>();
    for (String f : Fields.PREDEFINED) {
      Object raw = body.get(f);
      if (raw != null && !(raw instanceof String)) {
        errors.add(new FieldError(f, "must be text"));
        continue;
      }
      String v = Text.clean(raw);
      if (v != null && v.length() > Fields.MAX_LENGTH.get(f)) {
        errors.add(new FieldError(f, "at most " + Fields.MAX_LENGTH.get(f) + " characters"));
        continue;
      }
      if (v != null && f.equals("email") && !Emails.valid(v)) {
        errors.add(new FieldError(f, "must be a valid email"));
        continue;
      }
      if (v != null && f.equals("country")) {
        v = v.toUpperCase(Locale.ROOT);
        if (!COUNTRIES.contains(v)) {
          errors.add(new FieldError(f, "must be an ISO 3166-1 alpha-2 country code"));
          continue;
        }
      }
      fields.put(f, v);
    }
    boolean anyError = errors.stream().anyMatch(e -> Set.of("firstName", "lastName", "email").contains(e.field()));
    if (!anyError && fields.get("firstName") == null && fields.get("lastName") == null && fields.get("email") == null)
      errors.add(new FieldError("firstName", "first name, last name or email is required"));
    List<Attribute> attributes = attributes(body.get("attributes"), errors);
    List<String> tags = tags(body.get("tags"), errors);
    if (!errors.isEmpty()) throw ApiException.badRequest(errors);
    return new ContactState(fields, attributes, tags, false, null);
  }

  static List<Attribute> attributes(Object raw, List<FieldError> errors) {
    List<Attribute> out = new ArrayList<>();
    if (raw == null) return out;
    if (!(raw instanceof List<?> list)) {
      errors.add(new FieldError("attributes", "must be a list"));
      return out;
    }
    if (list.size() > MAX_ATTRIBUTES) {
      errors.add(new FieldError("attributes", "too many attributes"));
      return out;
    }
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < list.size(); i++) {
      String at = "attributes[" + i + "]";
      if (!(list.get(i) instanceof Map<?, ?> item)) {
        errors.add(new FieldError(at, "must be an object"));
        continue;
      }
      Object k = item.get("key");
      Object v = item.get("value");
      String key = k instanceof String s ? s.strip() : null;
      if (key == null || !KEY.matcher(key).matches()) {
        errors.add(new FieldError(at + ".key", "invalid key"));
      } else if (RESERVED_KEYS.contains(key.toLowerCase(Locale.ROOT))) {
        errors.add(new FieldError(at + ".key", "reserved key"));
      } else if (!seen.add(key.toLowerCase(Locale.ROOT))) {
        errors.add(new FieldError(at + ".key", "duplicate key"));
      }
      String value = v instanceof String s ? Text.clean(s) : null;
      if (v != null && !(v instanceof String)) errors.add(new FieldError(at + ".value", "must be text"));
      else if (value == null) errors.add(new FieldError(at + ".value", "required"));
      else if (value.length() > MAX_ATTRIBUTE_VALUE)
        errors.add(new FieldError(at + ".value", "at most " + MAX_ATTRIBUTE_VALUE + " characters"));
      if (key != null && value != null) out.add(new Attribute(key, value));
    }
    return out;
  }

  static List<String> tags(Object raw, List<FieldError> errors) {
    List<String> out = new ArrayList<>();
    if (raw == null) return out;
    if (!(raw instanceof List<?> list)) {
      errors.add(new FieldError("tags", "must be a list"));
      return out;
    }
    if (list.size() > MAX_TAGS) {
      errors.add(new FieldError("tags", "too many tags"));
      return out;
    }
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < list.size(); i++) {
      String at = "tags[" + i + "]";
      String tag = list.get(i) instanceof String s ? s.strip() : null;
      if (!validTag(tag)) errors.add(new FieldError(at, "invalid tag"));
      else if (!seen.add(tag.toLowerCase(Locale.ROOT))) errors.add(new FieldError(at, "duplicate tag"));
      else out.add(tag);
    }
    return out;
  }

  public static boolean validTag(String tag) {
    return tag != null && !tag.isEmpty() && tag.length() <= MAX_TAG && tag.codePoints().noneMatch(Character::isWhitespace);
  }
}
