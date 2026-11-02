package si.contacts.auth;

public class InvalidTokenException extends Exception {
  public InvalidTokenException(String reason) {
    super(reason, null, false, false);
  }
}
