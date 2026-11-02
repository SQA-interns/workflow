package si.contacts.contact;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contacts.store.ContactStore;
import si.contacts.store.ContactStore.Tag;
import si.contacts.store.RevisionStore;
import si.contacts.store.TagStore;
import si.contacts.web.ApiException;
import si.contacts.workspace.Role;
import si.contacts.workspace.WorkspaceScope;
import tools.jackson.databind.ObjectMapper;

/**
 * Every change of a Contact: the change, its one immutable Revision and the version check share
 * one transaction.
 */
@Service
public class ContactService {
  private final ContactStore contacts;
  private final RevisionStore revisions;
  private final TagStore tags;
  private final ObjectMapper json;

  public ContactService(ContactStore contacts, RevisionStore revisions, TagStore tags, ObjectMapper json) {
    this.contacts = contacts;
    this.revisions = revisions;
    this.tags = tags;
    this.json = json;
  }

  @Transactional
  public Contact create(WorkspaceScope s, ContactState input) {
    s.require(Role.EDITOR);
    UUID id = UUID.randomUUID();
    List<Tag> resolved = tags.resolve(s, input.tags());
    ContactState st = input.withTags(resolved.stream().map(Tag::name).toList());
    contacts.insert(s, id, st, resolved);
    revisions.append(s, id, 1, "CREATE", write(st));
    return contacts.find(s, id).orElseThrow();
  }

  public Contact get(WorkspaceScope s, UUID id) {
    return contacts.find(s, id).orElseThrow(ApiException::notFound);
  }

  @Transactional
  public Contact update(WorkspaceScope s, UUID id, Integer version, ContactState input) {
    s.require(Role.EDITOR);
    if (version == null) throw ApiException.badRequest("version", "required");
    Contact current = get(s, id);
    if (current.state().deleted()) throw ApiException.conflict(null, "contact is deleted");
    return write(s, current, version, input, "UPDATE");
  }

  @Transactional
  public void delete(WorkspaceScope s, UUID id, Integer version) {
    s.require(Role.EDITOR);
    Contact current = contacts.findForUpdate(s, id).orElseThrow(ApiException::notFound);
    int expected = version == null ? current.version() : version;
    if (current.version() != expected) throw ApiException.outdatedVersion();
    if (current.state().deleted()) throw ApiException.conflict(null, "contact is deleted");
    write(s, current, expected, current.state().withDeleted(true, null), "DELETE");
  }

  /** Restores a Deleted contact with its last state. */
  @Transactional
  public Contact restoreDeleted(WorkspaceScope s, UUID id) {
    s.require(Role.EDITOR);
    Contact current = contacts.findForUpdate(s, id).orElseThrow(ApiException::notFound);
    if (!current.state().deleted()) throw ApiException.conflict(null, "contact is not deleted");
    return write(s, current, current.version(), current.state().withDeleted(false, null), "RESTORE");
  }

  /** Makes Revision {@code number} current again as a new RESTORE Revision. */
  @Transactional
  public Contact restoreRevision(WorkspaceScope s, UUID id, int number, Integer version) {
    s.require(Role.EDITOR);
    if (version == null) throw ApiException.badRequest("version", "required");
    Contact current = get(s, id);
    var rev = revisions.find(s, id, number).orElseThrow(ApiException::notFound);
    if (current.state().deleted()) throw ApiException.conflict(null, "contact is deleted");
    ContactState old = read(rev.stateJson());
    return write(s, current, version, old.withDeleted(false, null), "RESTORE");
  }

  /** Permanently removes a Deleted contact and all its Revisions. */
  @Transactional
  public void purge(WorkspaceScope s, UUID id) {
    s.require(Role.OWNER);
    Contact current = contacts.findForUpdate(s, id).orElseThrow(ApiException::notFound);
    if (!current.state().deleted()) throw ApiException.conflict(null, "contact is not deleted");
    contacts.purge(s, id);
  }

  /**
   * Writes {@code next} on top of {@code current} if it is still at {@code expectedVersion}, with
   * one Revision of {@code type}. Tags are resolved (and re-created if deleted since).
   */
  public Contact write(WorkspaceScope s, Contact current, int expectedVersion, ContactState next, String type) {
    List<Tag> resolved = tags.resolve(s, next.tags());
    ContactState st = next.withTags(resolved.stream().map(Tag::name).toList());
    int version =
        contacts.update(s, current.id(), expectedVersion, st, resolved).orElseThrow(ApiException::outdatedVersion);
    revisions.append(s, current.id(), version, type, write(st));
    return contacts.find(s, current.id()).orElseThrow();
  }

  public String write(ContactState st) {
    return json.writeValueAsString(st.toMap());
  }

  @SuppressWarnings("unchecked")
  public ContactState read(String stateJson) {
    return ContactState.fromMap(json.readValue(stateJson, Map.class));
  }
}
