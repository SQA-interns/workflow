package si.contacts.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import si.contacts.web.ApiException;
import si.contacts.web.FieldError;

class NormalizeAndValidationTest {

  static ContactState state(Map<String, String> fields) {
    return new ContactState(fields, List.of(), List.of(), false, null);
  }

  @Test
  void phonesNeedSixDigitsAndTreat00AsPlus() {
    assertThat(Normalize.phone("12345")).isNull();
    assertThat(Normalize.phone("123456")).isEqualTo("123456");
    assertThat(Normalize.phone("00 1234")).isNull();
    assertThat(Normalize.phone("00 123456")).isEqualTo("+123456");
    assertThat(Normalize.phone("+386 (41) 123-456")).isEqualTo("+38641123456");
    assertThat(Normalize.phone("041 123 456")).isEqualTo("041123456");
    assertThat(Normalize.phone(null)).isNull();
  }

  @Test
  void textAndNamesIgnoreCaseDiacriticsAndSpaces() {
    assertThat(Normalize.text("  ŠČŽ  đĐ łŁ øØ ć ")).isEqualTo("scz dd ll oo c");
    assertThat(Normalize.text(null)).isNull();
    assertThat(Normalize.fullName("Saša", " Đurić ")).isEqualTo("sasa duric");
    assertThat(Normalize.fullName("Saša", null)).isNull();
    assertThat(Normalize.fullName(null, "Kos")).isNull();
    assertThat(Normalize.fullName("  ", "Kos")).isNull();
    assertThat(Normalize.fullName("Ana", " ")).isNull();
    assertThat(Normalize.email(" A@B.SI ")).isEqualTo("a@b.si");
    assertThat(Normalize.email(null)).isNull();
    assertThat(Normalize.likeEscape("a%b_c\\d")).isEqualTo("a\\%b\\_c\\\\d");
  }

  @Test
  void theSearchTextHoldsExactlyNamesEmailPhoneCompanyAndCity() {
    Map<String, String> f = new HashMap<>();
    f.put("firstName", "Saša");
    f.put("lastName", "Kos");
    f.put("email", "S@X.si");
    f.put("phone", "+386 41");
    f.put("company", "Krka");
    f.put("city", "Novo mesto");
    f.put("note", "skrito");
    assertThat(Normalize.searchText(state(f)))
        .isEqualTo("\u0001sasa\u0001kos\u0001sasa kos\u0001s@x.si\u0001+386 41\u0001+38641\u0001krka\u0001novo mesto");
    assertThat(Normalize.searchText(state(Map.of("firstName", "Ana")))).isEqualTo("\u0001ana");
    assertThat(Normalize.searchText(state(Map.of("lastName", "Kos")))).isEqualTo("\u0001kos");
  }

  @Test
  void listsOfAttributesAndTagsMustBeListsOfTheRightShape() {
    List<FieldError> e = new ArrayList<>();
    assertThat(ContactValidator.attributes("x", e)).isEmpty();
    assertThat(ContactValidator.attributes(List.of("x"), e)).isEmpty();
    assertThat(ContactValidator.attributes(List.of(Map.of("key", "k", "value", 5)), e)).isEmpty();
    assertThat(ContactValidator.tags("x", e)).isEmpty();
    assertThat(ContactValidator.tags(List.of(5), e)).isEmpty();
    assertThat(e).extracting(FieldError::field)
        .containsExactly("attributes", "attributes[0]", "attributes[0].value", "tags", "tags[0]");
    assertThat(e).extracting(FieldError::message)
        .containsExactly("must be a list", "must be an object", "must be text", "must be a list", "invalid tag");
  }

  @Test
  void validListsAreKeptInOrderAndTrimmed() {
    List<FieldError> e = new ArrayList<>();
    assertThat(ContactValidator.attributes(List.of(Map.of("key", " a ", "value", " 1 "), Map.of("key", "b", "value", "2")), e))
        .containsExactly(new Attribute("a", "1"), new Attribute("b", "2"));
    assertThat(ContactValidator.tags(List.of(" x ", "y"), e)).containsExactly("x", "y");
    assertThat(ContactValidator.attributes(null, e)).isEmpty();
    assertThat(ContactValidator.tags(null, e)).isEmpty();
    assertThat(e).isEmpty();
  }

  @Test
  void aTagIsOneToFiftyCharactersWithoutWhitespace() {
    assertThat(ContactValidator.validTag("x".repeat(50))).isTrue();
    assertThat(ContactValidator.validTag("x".repeat(51))).isFalse();
    assertThat(ContactValidator.validTag("")).isFalse();
    assertThat(ContactValidator.validTag(null)).isFalse();
    assertThat(ContactValidator.validTag("a\tb")).isFalse();
  }

  @Test
  void anIdentityFieldErrorDoesNotAlsoReportTheMissingIdentity() {
    assertThatThrownBy(() -> ContactValidator.parse(Map.of("email", "ni-email")))
        .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.errors()).extracting(FieldError::field).containsExactly("email"));
    assertThatThrownBy(() -> ContactValidator.parse(Map.of("lastName", "x".repeat(101))))
        .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.errors()).extracting(FieldError::field).containsExactly("lastName"));
    assertThatThrownBy(() -> ContactValidator.parse(Map.of("city", "Kranj")))
        .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.errors()).extracting(FieldError::field).containsExactly("firstName"));
    assertThat(ContactValidator.parse(Map.of("firstName", "x".repeat(100))).field("firstName")).hasSize(100);
  }

  @Test
  void queryParametersAreCheckedAtTheirLimits() {
    assertThat(ContactQuery.parse(Map.of("page", "100000", "size", "1"), null, null).page()).isEqualTo(100000);
    assertThatThrownBy(() -> ContactQuery.parse(Map.of("page", "100001"), null, null)).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> ContactQuery.parse(Map.of("size", "0"), null, null)).isInstanceOf(ApiException.class);
    assertThat(ContactQuery.parse(Map.of("size", "100"), null, null).size()).isEqualTo(100);
    assertThatThrownBy(() -> ContactQuery.parse(Map.of("dir", "up"), null, null)).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> ContactQuery.parse(Map.of("page", "x"), null, null)).isInstanceOf(ApiException.class);
    ContactQuery q = ContactQuery.parse(Map.of("page", " ", "sort", "updatedAt", "country", "si"), List.of(" a ", "a", " "), null);
    assertThat(q.page()).isZero();
    assertThat(q.descending()).isTrue();
    assertThat(q.country()).isEqualTo("SI");
    assertThat(q.tags()).containsExactly("a");
    assertThat(q.attrs()).isEmpty();
  }

  @Test
  void anExportFilterTakesSingleValuesOrListsOfText() {
    ContactQuery q = ContactQuery.fromFilter(Map.of("tag", "vip", "attr", List.of("k=v"), "q", "ana", "tagMode", "any"));
    assertThat(q.tags()).containsExactly("vip");
    assertThat(q.attrs()).containsExactly("k=v");
    assertThat(q.q()).isEqualTo("ana");
    assertThat(q.tagModeAny()).isTrue();
    assertThat(ContactQuery.fromFilter(Map.of()).tags()).isEmpty();
    assertThatThrownBy(() -> ContactQuery.fromFilter(Map.of("tag", List.of(1))))
        .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.errors().get(0).field()).isEqualTo("filter.tag"));
    assertThatThrownBy(() -> ContactQuery.fromFilter(Map.of("attr", 5)))
        .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.errors().get(0).field()).isEqualTo("filter.attr"));
  }

  @Test
  void theDefaultOrderIsLastNameThenFirstNameThenIdWithAbsentNamesLast() {
    UUID a = UUID.fromString("00000000-0000-0000-0000-000000000001");
    UUID b = UUID.fromString("00000000-0000-0000-0000-000000000002");
    Contact kosAna = contact(b, "Ana", "Kos");
    Contact kosBor = contact(a, "Bor", "Kos");
    Contact kosAna2 = contact(a, "ana", "KOS");
    Contact noLast = contact(a, "Ana", null);
    Contact novak = contact(a, "Cene", "Novak");
    List<Contact> list = new ArrayList<>(List.of(noLast, novak, kosBor, kosAna, kosAna2));
    list.sort(ContactOrder.DEFAULT);
    assertThat(list).containsExactly(kosAna2, kosAna, kosBor, novak, noLast);
  }

  static Contact contact(UUID id, String first, String last) {
    Map<String, String> f = new HashMap<>();
    f.put("firstName", first);
    f.put("lastName", last);
    return new Contact(id, 1, state(f), null, null);
  }
}
