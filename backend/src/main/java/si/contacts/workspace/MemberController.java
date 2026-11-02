package si.contacts.workspace;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.store.MemberStore;
import si.contacts.store.MemberStore.InvitationRow;
import si.contacts.store.MemberStore.MemberRow;
import si.contacts.store.UserStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.web.Emails;
import si.contacts.web.Text;

/** US-003: an Owner shares the Workspace; a Workspace always keeps at least one Owner. */
@RestController
@RequestMapping("/api/workspaces/{wid}")
public class MemberController {
  private final WorkspaceAccess access;
  private final MemberStore members;
  private final UserStore users;

  public MemberController(WorkspaceAccess access, MemberStore members, UserStore users) {
    this.access = access;
    this.members = members;
    this.users = users;
  }

  @GetMapping("/members")
  Map<String, Object> list(User user, @PathVariable UUID wid) {
    WorkspaceScope s = access.open(wid, user);
    return Map.of(
        "members", members.members(s).stream().map(MemberController::view).toList(),
        "invitations", members.invitations(s).stream().map(MemberController::view).toList());
  }

  @PostMapping("/members")
  @ResponseStatus(HttpStatus.CREATED)
  @Transactional
  Map<String, Object> add(User user, @PathVariable UUID wid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.openForUpdate(wid, user).require(Role.OWNER);
    String email = Text.clean(body.get("email") instanceof String e ? e : null);
    if (email == null) throw ApiException.badRequest("email", "required");
    if (!Emails.valid(email)) throw ApiException.badRequest("email", "must be a valid email");
    Role role = role(body.get("role"));
    String lower = email.toLowerCase(Locale.ROOT);
    if (members.memberOrInvited(s, lower)) throw ApiException.conflict("email", "already a member or invited");
    var existing = users.findVerifiedByEmail(lower);
    if (existing.isPresent()) {
      User u = existing.get();
      members.addMember(s, u.id(), role.name());
      return Map.of("status", "MEMBER", "member", view(members.member(s, u.id()).orElseThrow()));
    }
    return Map.of("status", "INVITED", "invitation", view(members.invite(s, email, role.name())));
  }

  @PatchMapping("/members/{userId}")
  @Transactional
  Map<String, Object> changeRole(
      User user, @PathVariable UUID wid, @PathVariable UUID userId, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.openForUpdate(wid, user).require(Role.OWNER);
    Role role = role(body.get("role"));
    MemberRow target = members.member(s, userId).orElseThrow(ApiException::notFound);
    if (target.role().equals("OWNER") && role != Role.OWNER && members.owners(s) <= 1)
      throw ApiException.conflict("role", "a workspace needs an owner");
    members.changeRole(s, userId, role.name());
    return view(members.member(s, userId).orElseThrow());
  }

  @DeleteMapping("/members/{userId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  void remove(User user, @PathVariable UUID wid, @PathVariable UUID userId) {
    WorkspaceScope s = access.openForUpdate(wid, user);
    if (!userId.equals(user.id())) s.require(Role.OWNER);
    MemberRow target = members.member(s, userId).orElseThrow(ApiException::notFound);
    if (target.role().equals("OWNER") && members.owners(s) <= 1)
      throw ApiException.conflict(null, "a workspace needs an owner");
    members.remove(s, userId);
  }

  @DeleteMapping("/invitations/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  void cancel(User user, @PathVariable UUID wid, @PathVariable UUID id) {
    WorkspaceScope s = access.open(wid, user).require(Role.OWNER);
    if (!members.cancelInvitation(s, id)) throw ApiException.notFound();
  }

  static Role role(Object raw) {
    if (raw instanceof String r) {
      try {
        return Role.valueOf(r);
      } catch (IllegalArgumentException e) {
        // fall through
      }
    }
    throw ApiException.badRequest("role", "invalid role");
  }

  static Map<String, Object> view(MemberRow m) {
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("userId", m.userId());
    v.put("email", m.email());
    v.put("displayName", m.displayName());
    v.put("role", m.role());
    return v;
  }

  static Map<String, Object> view(InvitationRow i) {
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("id", i.id());
    v.put("email", i.email());
    v.put("role", i.role());
    v.put("createdAt", i.createdAt());
    return v;
  }
}
