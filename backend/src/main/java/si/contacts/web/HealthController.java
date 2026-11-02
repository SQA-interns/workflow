package si.contacts.web;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contacts.store.HealthStore;

@RestController
public class HealthController {
  private final HealthStore health;

  public HealthController(HealthStore health) {
    this.health = health;
  }

  @GetMapping("/api/health")
  Map<String, String> live() {
    return Map.of("status", "UP");
  }

  @GetMapping("/api/health/ready")
  ResponseEntity<Map<String, String>> ready() {
    return health.databaseUp()
        ? ResponseEntity.ok(Map.of("status", "UP"))
        : ResponseEntity.status(503).body(Map.of("status", "DOWN"));
  }
}
