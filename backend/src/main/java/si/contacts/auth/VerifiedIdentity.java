package si.contacts.auth;

/** The identity a verified Firebase ID token proves. */
public record VerifiedIdentity(String uid, String email, boolean emailVerified, String displayName) {}
