package si.contacts.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contacts.auth.VerifiedIdentity;
import si.contacts.store.UserStore;
import si.contacts.workspace.WorkspaceAccess;

@Service
public class UserService {
  private final UserStore users;
  private final WorkspaceAccess access;

  public UserService(UserStore users, WorkspaceAccess access) {
    this.users = users;
    this.access = access;
  }

  /**
   * Creates the User on first sign-in, keeps email, verified flag and display name current, and
   * turns pending invitations for a verified email into memberships.
   */
  @Transactional
  public User signIn(VerifiedIdentity id) {
    User user = users.upsert(id.uid(), id.email(), id.emailVerified(), id.displayName());
    if (user.emailVerified() && user.email() != null) access.activateInvitations(user);
    return user;
  }
}
