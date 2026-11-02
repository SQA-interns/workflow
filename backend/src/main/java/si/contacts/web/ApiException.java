package si.contacts.web;

import java.util.List;
import org.springframework.http.HttpStatus;

/** Any refusal of the API: a status and the field errors of its body. */
public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final transient List<FieldError> errors;

  public ApiException(HttpStatus status, List<FieldError> errors) {
    super(status + " " + errors.size() + " error(s)", null, false, false);
    this.status = status;
    this.errors = List.copyOf(errors);
  }

  public HttpStatus status() {
    return status;
  }

  public List<FieldError> errors() {
    return errors;
  }

  public static ApiException notFound() {
    return new ApiException(HttpStatus.NOT_FOUND, List.of(new FieldError(null, "not found")));
  }

  public static ApiException forbidden() {
    return new ApiException(HttpStatus.FORBIDDEN, List.of(new FieldError(null, "forbidden")));
  }

  public static ApiException conflict(String field, String message) {
    return new ApiException(HttpStatus.CONFLICT, List.of(new FieldError(field, message)));
  }

  public static ApiException badRequest(String field, String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, List.of(new FieldError(field, message)));
  }

  public static ApiException badRequest(List<FieldError> errors) {
    return new ApiException(HttpStatus.BAD_REQUEST, errors);
  }

  public static ApiException outdatedVersion() {
    return conflict("version", "outdated version");
  }
}
