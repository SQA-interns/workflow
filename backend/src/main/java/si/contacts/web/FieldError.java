package si.contacts.web;

/** One entry of every error body: {@code {"errors":[{"field":..., "message":...}]}}. */
public record FieldError(String field, String message) {}
