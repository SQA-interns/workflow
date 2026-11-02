package si.contacts.workspace;

import java.util.UUID;
import si.contacts.user.User;
import si.contacts.web.ApiException;

/**
 * Proof that the caller is a Member of one Workspace, with their Role. Only {@link
 * WorkspaceAccess} creates it (ADR-0001), and every store of Workspace-owned data requires it.
 */
public final class WorkspaceScope {
  private final UUID workspaceId;
  private final User user;
  private final Role role;

  WorkspaceScope(UUID workspaceId, User user, Role role) {
    this.workspaceId = workspaceId;
    this.user = user;
    this.role = role;
  }

  public UUID workspaceId() {
    return workspaceId;
  }

  public User user() {
    return user;
  }

  public Role role() {
    return role;
  }

  /** 403 unless the caller has at least the Role. */
  public WorkspaceScope require(Role min) {
    if (!role.atLeast(min)) throw ApiException.forbidden();
    return this;
  }
}
