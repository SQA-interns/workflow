package si.contacts.tag;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.contact.Contact;
import si.contacts.contact.ContactService;
import si.contacts.contact.ContactValidator;
import si.contacts.store.ContactStore;
import si.contacts.store.ContactStore.Tag;
import si.contacts.store.TagStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.workspace.Role;
import si.contacts.workspace.WorkspaceAccess;
import si.contacts.workspace.WorkspaceScope;

/**
 * US-007: Tags of a Workspace. Rename and delete change every affected Contact, each with an
 * UPDATE Revision, in one transaction or not at all.
 */
@RestController
@RequestMapping("/api/workspaces/{wid}/tags")
public class TagController {
  private final WorkspaceAccess access;
  private final TagStore tags;
  private final ContactStore contacts;
  private final ContactService service;

  public TagController(WorkspaceAccess access, TagStore tags, ContactStore contacts, ContactService service) {
    this.access = access;
    this.tags = tags;
    this.contacts = contacts;
    this.service = service;
  }

  @GetMapping
  List<Map<String, Object>> list(User user, @PathVariable UUID wid) {
    WorkspaceScope s = access.open(wid, user);
    return tags.counts(s).stream().map(t -> view(t.name(), t.count())).toList();
  }

  @PatchMapping("/{name}")
  @Transactional
  Map<String, Object> rename(User user, @PathVariable UUID wid, @PathVariable String name, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(Role.EDITOR);
    Object raw = body.get("name");
    String newName = raw instanceof String n ? n.strip() : null;
    if (!ContactValidator.validTag(newName)) throw ApiException.badRequest("name", "invalid tag");
    Tag tag = tags.findForUpdate(s, name).orElseThrow(ApiException::notFound);
    tags.find(s, newName)
        .filter(other -> !other.id().equals(tag.id()))
        .ifPresent(other -> {
          throw ApiException.conflict("name", "tag name taken");
        });
    List<UUID> affected = tags.contactsWith(s, tag.id());
    tags.rename(s, tag.id(), newName);
    for (Contact c : contacts.load(s, affected)) {
      List<String> renamed = c.state().tags().stream().map(t -> t.equalsIgnoreCase(tag.name()) ? newName : t).toList();
      service.write(s, c, c.version(), c.state().withTags(renamed), "UPDATE");
    }
    int count = (int) contacts.load(s, affected).stream().filter(c -> !c.state().deleted()).count();
    return view(newName, count);
  }

  @DeleteMapping("/{name}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  void delete(User user, @PathVariable UUID wid, @PathVariable String name) {
    WorkspaceScope s = access.open(wid, user).require(Role.EDITOR);
    Tag tag = tags.findForUpdate(s, name).orElseThrow(ApiException::notFound);
    for (Contact c : contacts.load(s, tags.contactsWith(s, tag.id()))) {
      List<String> rest = c.state().tags().stream().filter(t -> !t.equalsIgnoreCase(tag.name())).toList();
      service.write(s, c, c.version(), c.state().withTags(rest), "UPDATE");
    }
    tags.delete(s, tag.id());
  }

  static Map<String, Object> view(String name, int count) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("name", name);
    m.put("count", count);
    return m;
  }
}
