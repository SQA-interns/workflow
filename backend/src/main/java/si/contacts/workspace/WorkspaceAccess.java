package si.contacts.workspace;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import si.contacts.store.AccessStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;

/**
 * The Workspace-scoped access layer (ADR-0001): the only way from a Workspace id and a caller to
 * a {@link WorkspaceScope}, decided by the membership stored in PostgreSQL.
 */
@Component
public class WorkspaceAccess {
  private final AccessStore store;

  public WorkspaceAccess(AccessStore store) {
    this.store = store;
  }

  /** The caller's scope in the Workspace; 404 for a non-Member exactly as for a missing one. */
  public WorkspaceScope open(UUID workspaceId, User caller) {
    return find(workspaceId, caller).orElseThrow(ApiException::notFound);
  }

  /** The same as {@link #open} but locks the Workspace row for membership changes. */
  public WorkspaceScope openForUpdate(UUID workspaceId, User caller) {
    store.lockWorkspace(workspaceId);
    return open(workspaceId, caller);
  }

  public Optional<WorkspaceScope> find(UUID workspaceId, User caller) {
    return store.roleOf(workspaceId, caller.id()).map(r -> new WorkspaceScope(workspaceId, caller, Role.valueOf(r)));
  }

  /** Creates a Workspace with the caller as Owner. */
  public WorkspaceScope create(User caller, String name) {
    UUID id = store.createWorkspace(name, caller.id());
    return new WorkspaceScope(id, caller, Role.OWNER);
  }

  public List<Membership> workspacesOf(User caller) {
    return store.workspacesOf(caller.id());
  }

  public void activateInvitations(User user) {
    store.activateInvitations(user.id(), user.email().toLowerCase(java.util.Locale.ROOT));
  }
}
