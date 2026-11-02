package si.contacts.contact;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import si.contacts.web.ApiException;
import si.contacts.web.Text;

/** Search, filters, sort and paging of the Contact list (all evaluated in the database, AR-10). */
public record ContactQuery(
    String q,
    List<String> tags,
    boolean tagModeAny,
    List<String> attrs,
    String country,
    String company,
    boolean deleted,
    String sort,
    boolean descending,
    int page,
    int size) {
  public static final int MAX_SIZE = 100;
  static final Set<String> SORTS = Set.of("lastName", "firstName", "company", "updatedAt");

  public static ContactQuery parse(Map<String, String> p, List<String> tags, List<String> attrs) {
    String sort = p.getOrDefault("sort", "lastName");
    if (!SORTS.contains(sort)) throw ApiException.badRequest("sort", "invalid sort");
    String dir = p.getOrDefault("dir", sort.equals("updatedAt") ? "desc" : "asc");
    if (!dir.equals("asc") && !dir.equals("desc")) throw ApiException.badRequest("dir", "invalid direction");
    String mode = p.getOrDefault("tagMode", "all");
    if (!mode.equals("all") && !mode.equals("any")) throw ApiException.badRequest("tagMode", "invalid tag mode");
    int page = integer(p.get("page"), 0, "page");
    int size = integer(p.get("size"), 20, "size");
    if (page < 0 || page > 100_000) throw ApiException.badRequest("page", "between 0 and 100000");
    if (size < 1 || size > MAX_SIZE) throw ApiException.badRequest("size", "between 1 and " + MAX_SIZE);
    return new ContactQuery(
        Text.clean(p.get("q")),
        clean(tags),
        mode.equals("any"),
        clean(attrs),
        upper(Text.clean(p.get("country"))),
        Text.clean(p.get("company")),
        "true".equals(p.get("deleted")),
        sort,
        dir.equals("desc"),
        page,
        size);
  }

  /** A filter for an Export: everything matching, in the filter's order. */
  @SuppressWarnings("unchecked")
  public static ContactQuery fromFilter(Map<String, Object> f) {
    Map<String, String> single = new java.util.HashMap<>();
    for (String k : List.of("q", "tagMode", "country", "company", "sort", "dir")) {
      Object v = f.get(k);
      if (v != null) single.put(k, v.toString());
    }
    List<String> tags = asList(f.get("tag"), "filter.tag");
    List<String> attrs = asList(f.get("attr"), "filter.attr");
    return parse(single, tags, attrs);
  }

  private static List<String> asList(Object v, String field) {
    if (v == null) return List.of();
    if (v instanceof String s) return List.of(s);
    if (v instanceof List<?> l && l.stream().allMatch(x -> x instanceof String)) return l.stream().map(Object::toString).toList();
    throw ApiException.badRequest(field, "must be a list");
  }

  private static List<String> clean(List<String> in) {
    if (in == null) return List.of();
    return in.stream().map(Text::clean).filter(java.util.Objects::nonNull).distinct().toList();
  }

  private static String upper(String s) {
    return s == null ? null : s.toUpperCase(Locale.ROOT);
  }

  private static int integer(String raw, int def, String field) {
    if (raw == null || raw.isBlank()) return def;
    try {
      return Integer.parseInt(raw.trim());
    } catch (NumberFormatException e) {
      throw ApiException.badRequest(field, "must be a number");
    }
  }

  public ContactQuery withPaging(int newPage, int newSize) {
    return new ContactQuery(q, tags, tagModeAny, attrs, country, company, deleted, sort, descending, newPage, newSize);
  }
}
