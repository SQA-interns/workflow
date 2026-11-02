package si.contacts.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.MissingServletRequestParameterException;

class ErrorHandlerTest {
  final ErrorHandler h = new ErrorHandler();

  @Test
  void everyFailureHasTheOneErrorShape() {
    var missing = h.missingParam(new MissingServletRequestParameterException("version", "int"));
    assertThat(missing.getStatusCode().value()).isEqualTo(400);
    assertThat(missing.getBody().errors()).containsExactly(new FieldError("version", "required"));
    assertThat(h.mediaType().getStatusCode().value()).isEqualTo(415);
    assertThat(h.mediaType().getBody().errors()).containsExactly(new FieldError(null, "unsupported media type"));
    assertThat(h.tooLarge().getStatusCode().value()).isEqualTo(413);
    assertThat(h.tooLarge().getBody().errors()).containsExactly(new FieldError(null, "request body too large"));
    var unexpected = h.unexpected(new IllegalStateException("secret detail"));
    assertThat(unexpected.getStatusCode().value()).isEqualTo(500);
    assertThat(unexpected.getBody().errors()).containsExactly(new FieldError(null, "internal error"));
    assertThat(h.method().getStatusCode().value()).isEqualTo(405);
    assertThat(h.api(ApiException.forbidden()).getBody().errors()).isEqualTo(List.of(new FieldError(null, "forbidden")));
  }

  @Test
  void errorBodyJsonMatchesTheShape() {
    assertThat(ErrorBody.json("x")).isEqualTo("{\"errors\":[{\"field\":null,\"message\":\"x\"}]}");
    assertThat(ErrorBody.NOT_FOUND_JSON).isEqualTo(ErrorBody.json("not found"));
  }

  @Test
  void emailsAreAtMost254Characters() {
    String local = "a".repeat(64);
    String domain = "b".repeat(254 - 64 - 1 - 3) + ".si";
    assertThat(Emails.valid(local + "@" + domain)).isTrue();
    assertThat(Emails.valid(local + "@b" + domain)).isFalse();
    assertThat(Emails.valid(null)).isFalse();
    assertThat(Emails.valid("a..b@c.si")).isFalse();
    assertThat(Text.clean("  ")).isNull();
    assertThat(Text.clean(null)).isNull();
    assertThat(Text.clean(" x ")).isEqualTo("x");
  }
}
