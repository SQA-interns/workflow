package si.contacts.export;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactOrder;
import si.contacts.contact.ContactQuery;
import si.contacts.store.ContactSearchStore;
import si.contacts.store.ContactStore;
import si.contacts.store.WorkspaceStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.workspace.WorkspaceAccess;
import si.contacts.workspace.WorkspaceScope;

/** US-012: Export of the selected Contacts or of all Contacts matching a filter; Viewers may export. */
@RestController
public class ExportController {
  static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  static final ZoneId ZONE = ZoneId.of("Europe/Ljubljana");
  private final WorkspaceAccess access;
  private final ContactStore contacts;
  private final ContactSearchStore search;
  private final WorkspaceStore workspaces;
  private final int max;

  public ExportController(
      WorkspaceAccess access,
      ContactStore contacts,
      ContactSearchStore search,
      WorkspaceStore workspaces,
      @Value("${app.export.max-contacts:10000}") int max) {
    this.access = access;
    this.contacts = contacts;
    this.search = search;
    this.workspaces = workspaces;
    this.max = max;
  }

  @PostMapping("/api/workspaces/{wid}/export")
  @Transactional(readOnly = true)
  ResponseEntity<byte[]> export(User user, @PathVariable UUID wid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user);
    boolean hasIds = body.containsKey("contactIds");
    boolean hasFilter = body.containsKey("filter");
    if (hasIds == hasFilter) throw ApiException.badRequest(null, "exactly one of contactIds and filter");
    List<Contact> selected = hasIds ? selection(s, body.get("contactIds")) : filtered(s, body.get("filter"));
    byte[] file = Workbooks.write(selected);
    String name = workspaces.name(s);
    String date = LocalDate.now(ZONE).toString();
    String utf8 = safe(name, false) + "-" + date + ".xlsx";
    String ascii = safe(name, true) + "-" + date + ".xlsx";
    return ResponseEntity.ok()
        .contentType(XLSX)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + URLEncoder.encode(utf8, StandardCharsets.UTF_8).replace("+", "%20"))
        .body(file);
  }

  private List<Contact> selection(WorkspaceScope s, Object raw) {
    if (!(raw instanceof List<?> list) || list.isEmpty()) throw ApiException.badRequest("contactIds", "invalid selection");
    if (list.size() > max) throw ApiException.badRequest("contactIds", "too many contacts");
    Set<UUID> ids = new LinkedHashSet<>();
    for (Object o : list) {
      try {
        ids.add(UUID.fromString(String.valueOf(o)));
      } catch (IllegalArgumentException e) {
        throw ApiException.badRequest("contactIds", "invalid selection");
      }
    }
    List<Contact> found = new ArrayList<>(contacts.load(s, new ArrayList<>(ids)));
    if (found.size() != ids.size() || found.stream().anyMatch(c -> c.state().deleted()))
      throw ApiException.badRequest("contactIds", "invalid selection");
    found.sort(ContactOrder.DEFAULT);
    return found;
  }

  private List<Contact> filtered(WorkspaceScope s, Object raw) {
    if (!(raw instanceof Map<?, ?> m)) throw ApiException.badRequest("filter", "must be an object");
    @SuppressWarnings("unchecked")
    ContactQuery q = ContactQuery.fromFilter((Map<String, Object>) m);
    List<UUID> ids = search.ids(s, q, 0, max + 1);
    if (ids.size() > max) throw ApiException.badRequest("filter", "too many contacts");
    return contacts.load(s, ids);
  }


  /** Letters, digits, - and _ only (ASCII when asked); spaces become -. */
  static String safe(String name, boolean ascii) {
    String n = ascii ? java.text.Normalizer.normalize(name.replace('đ', 'd').replace('Đ', 'D'), java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+", "") : name;
    n = n.strip().replaceAll("\\s+", "-");
    n = ascii ? n.replaceAll("[^A-Za-z0-9_-]", "") : n.replaceAll("[^\\p{L}\\p{N}_-]", "");
    return n.isEmpty() ? "kontakti" : n;
  }
}
