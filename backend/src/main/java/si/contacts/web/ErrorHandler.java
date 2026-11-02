package si.contacts.web;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Maps every failure to the one error shape. Never logs request data (SR: no personal data). */
@RestControllerAdvice
public class ErrorHandler {
  private static final Logger LOG = LoggerFactory.getLogger(ErrorHandler.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ErrorBody> api(ApiException e) {
    return ResponseEntity.status(e.status()).body(new ErrorBody(e.errors()));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<ErrorBody> unreadable() {
    return of(HttpStatus.BAD_REQUEST, null, "malformed request body");
  }

  @ExceptionHandler({MethodArgumentTypeMismatchException.class, NoResourceFoundException.class})
  ResponseEntity<ErrorBody> notFound() {
    return of(HttpStatus.NOT_FOUND, null, "not found");
  }

  @ExceptionHandler(MissingServletRequestParameterException.class)
  ResponseEntity<ErrorBody> missingParam(MissingServletRequestParameterException e) {
    return of(HttpStatus.BAD_REQUEST, e.getParameterName(), "required");
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<ErrorBody> method() {
    return of(HttpStatus.METHOD_NOT_ALLOWED, null, "method not allowed");
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  ResponseEntity<ErrorBody> mediaType() {
    return of(HttpStatus.UNSUPPORTED_MEDIA_TYPE, null, "unsupported media type");
  }

  @ExceptionHandler(PayloadTooLargeException.class)
  ResponseEntity<ErrorBody> tooLarge() {
    return of(HttpStatus.CONTENT_TOO_LARGE, null, "request body too large");
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ErrorBody> unexpected(Exception e) {
    LOG.error("Unexpected error: {}", e.getClass().getName());
    return of(HttpStatus.INTERNAL_SERVER_ERROR, null, "internal error");
  }

  private static ResponseEntity<ErrorBody> of(HttpStatus s, String field, String message) {
    return ResponseEntity.status(s).body(new ErrorBody(List.of(new FieldError(field, message))));
  }
}
