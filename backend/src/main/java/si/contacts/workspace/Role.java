package si.contacts.workspace;

/** A Member's Role in one Workspace, from least to most rights. */
public enum Role {
  VIEWER,
  EDITOR,
  OWNER;

  public boolean atLeast(Role other) {
    return compareTo(other) >= 0;
  }
}
