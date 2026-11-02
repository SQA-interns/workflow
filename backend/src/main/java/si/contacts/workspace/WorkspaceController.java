package si.contacts.workspace;

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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.store.WorkspaceStore;
import si.contacts.user.User;
import si.contacts.web.ApiException;
import si.contacts.web.Text;

@RestController
@RequestMapping("/api/workspaces")
public class WorkspaceController {
  static final int MAX_NAME = 100;
  private final WorkspaceAccess access;
  private final WorkspaceStore workspaces;

  public WorkspaceController(WorkspaceAccess access, WorkspaceStore workspaces) {
    this.access = access;
    this.workspaces = workspaces;
  }

  @GetMapping
  List<Map<String, Object>> list(User user) {
    return access.workspacesOf(user).stream().map(m -> view(m.id(), m.name(), m.role())).toList();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @Transactional
  Map<String, Object> create(User user, @RequestBody Map<String, Object> body) {
    String name = name(body.get("name"));
    WorkspaceScope scope = access.create(user, name);
    return view(scope.workspaceId(), name, Role.OWNER.name());
  }

  @GetMapping("/{wid}")
  Map<String, Object> get(User user, @PathVariable UUID wid) {
    WorkspaceScope s = access.open(wid, user);
    return view(wid, workspaces.name(s), s.role().name());
  }

  @PatchMapping("/{wid}")
  @Transactional
  Map<String, Object> rename(User user, @PathVariable UUID wid, @RequestBody Map<String, Object> body) {
    WorkspaceScope s = access.open(wid, user).require(Role.OWNER);
    String name = name(body.get("name"));
    workspaces.rename(s, name);
    return view(wid, name, s.role().name());
  }

  @DeleteMapping("/{wid}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  void delete(User user, @PathVariable UUID wid, @RequestBody(required = false) Map<String, Object> body) {
    WorkspaceScope s = access.openForUpdate(wid, user).require(Role.OWNER);
    Object confirm = body == null ? null : body.get("confirmName");
    if (!(confirm instanceof String c) || !c.equals(workspaces.name(s)))
      throw ApiException.badRequest("confirmName", "must equal the Workspace name exactly");
    workspaces.delete(s);
  }

  static String name(Object raw) {
    if (raw != null && !(raw instanceof String)) throw ApiException.badRequest("name", "must be text");
    String name = Text.clean(raw);
    if (name == null) throw ApiException.badRequest("name", "required");
    if (name.length() > MAX_NAME) throw ApiException.badRequest("name", "at most " + MAX_NAME + " characters");
    return name;
  }

  static Map<String, Object> view(UUID id, String name, String role) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", id);
    m.put("name", name);
    m.put("role", role);
    return m;
  }
}
