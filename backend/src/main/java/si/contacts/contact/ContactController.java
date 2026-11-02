package si.contacts.contact;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.store.RevisionStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.workspace.WorkspaceAccess;
import si.contacts.workspace.WorkspaceScope;

@RestController
@RequestMapping("/api/workspaces/{wid}/contacts")
public class ContactController {
  private final WorkspaceAccess access;
  private final ContactService service;
  private final ContactQueries queries;
  private final RevisionStore revisions;

  public ContactController(
      WorkspaceAccess access, ContactService service, ContactQueries queries, RevisionStore revisions) {
    this.access = access;
    this.service = service;
    this.queries = queries;
    this.revisions = revisions;
  }

  @GetMapping
  Map<String, Object> list(User user, @PathVariable UUID wid, @RequestParam Map<String, String> single,
      @RequestParam(name = "tag", required = false) List<String> tag,
      @RequestParam(name = "attr", required = false) List<String> attr) {
    WorkspaceScope s = access.open(wid, user);
    ContactQuery q = ContactQuery.parse(single, tag, attr);
    return queries.page(s, q);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  Map<String, Object> create(User user, @PathVariable UUID wid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(si.contacts.workspace.Role.EDITOR);
    Contact c = service.create(s, ContactValidator.parse(body));
    return queries.withDuplicates(s, c);
  }

  @GetMapping("/{cid}")
  Map<String, Object> get(User user, @PathVariable UUID wid, @PathVariable UUID cid) {
    return service.get(access.open(wid, user), cid).toJson();
  }

  @PutMapping("/{cid}")
  Map<String, Object> update(User user, @PathVariable UUID wid, @PathVariable UUID cid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(si.contacts.workspace.Role.EDITOR);
    Integer version = version(body.get("version"));
    Contact c = service.update(s, cid, version, ContactValidator.parse(body));
    return queries.withDuplicates(s, c);
  }

  @DeleteMapping("/{cid}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(User user, @PathVariable UUID wid, @PathVariable UUID cid, @RequestParam(required = false) Integer version) {
    service.delete(access.open(wid, user), cid, version);
  }

  @PostMapping("/{cid}/restore")
  Map<String, Object> restore(User user, @PathVariable UUID wid, @PathVariable UUID cid) {
    return service.restoreDeleted(access.open(wid, user), cid).toJson();
  }

  @PostMapping("/{cid}/purge")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void purge(User user, @PathVariable UUID wid, @PathVariable UUID cid) {
    service.purge(access.open(wid, user), cid);
  }

  @GetMapping("/{cid}/revisions")
  List<Map<String, Object>> revisions(User user, @PathVariable UUID wid, @PathVariable UUID cid) {
    WorkspaceScope s = access.open(wid, user);
    service.get(s, cid);
    return revisions.list(s, cid).stream()
        .map(
            r -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("number", r.number());
              m.put("type", r.type());
              Map<String, Object> author = new LinkedHashMap<>();
              author.put("id", r.authorId());
              author.put("email", r.authorEmail());
              author.put("displayName", r.authorName());
              m.put("author", author);
              m.put("createdAt", r.createdAt());
              m.put("state", service.read(r.stateJson()).toMap());
              return m;
            })
        .toList();
  }

  @PostMapping("/{cid}/revisions/{number}/restore")
  Map<String, Object> restoreRevision(
      User user, @PathVariable UUID wid, @PathVariable UUID cid, @PathVariable int number,
      @RequestBody(required = false) Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(si.contacts.workspace.Role.EDITOR);
    return service.restoreRevision(s, cid, number, version(body == null ? null : body.get("version"))).toJson();
  }

  static Integer version(Object raw) {
    if (raw == null) return null;
    if (raw instanceof Integer i) return i;
    if (raw instanceof Number n && n.doubleValue() == n.intValue()) return n.intValue();
    throw ApiException.badRequest("version", "must be a number");
  }
}
