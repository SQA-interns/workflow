package si.contacts.web;

public class PayloadTooLargeException extends RuntimeException {
  public PayloadTooLargeException() {
    super("payload too large", null, false, false);
  }
}
