package si.contacts.web;

import java.util.List;

public record ErrorBody(List<FieldError> errors) {
  public static final String NOT_FOUND_JSON = "{\"errors\":[{\"field\":null,\"message\":\"not found\"}]}";

  public static String json(String message) {
    return "{\"errors\":[{\"field\":null,\"message\":\"" + message + "\"}]}";
  }
}
