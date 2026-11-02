package si.contacts.workspace;

import java.util.UUID;

/** A Workspace the User belongs to, with their Role there. */
public record Membership(UUID id, String name, String role) {}
