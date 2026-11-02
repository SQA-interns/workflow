package si.contacts.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Firebase Authentication settings. {@code emulator=true} accepts the emulator's unsigned tokens. */
@ConfigurationProperties("app.auth")
public record AuthProperties(String projectId, boolean emulator, String jwksUri) {}
