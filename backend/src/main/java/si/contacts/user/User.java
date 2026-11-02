package si.contacts.user;

import java.util.UUID;

/** The application's own record of a signed-in person. */
public record User(UUID id, String firebaseUid, String email, boolean emailVerified, String displayName) {}
