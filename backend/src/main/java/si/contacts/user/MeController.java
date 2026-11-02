package si.contacts.user;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeController {
  @GetMapping("/api/me")
  Map<String, Object> me(User user) {
    var m = new java.util.LinkedHashMap<String, Object>();
    m.put("id", user.id());
    m.put("email", user.email());
    m.put("emailVerified", user.emailVerified());
    m.put("displayName", user.displayName());
    return m;
  }
}
