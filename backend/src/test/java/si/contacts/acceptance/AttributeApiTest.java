package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-006: Attributes on Contacts. */
class AttributeApiTest extends ApiTestBase {
  TestUser owner;
  String contacts;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    contacts = "/api/workspaces/" + createWorkspace(owner, "Atributi") + "/contacts";
  }

  static Map<String, Object> attr(String k, String v) {
    return Map.of("key", k, "value", v);
  }

  Api.Res create(List<?> attributes) {
    return api.post(owner.token(), contacts, contact("firstName", "Ana", "attributes", attributes));
  }

  @Test
  void AC_006_01_attributesAreStoredAndReturnedInTheOrderGiven() {
    Api.Res r = create(List.of(attr("zadnji", "1"), attr("kompetenca", "spletnoProgramiranje"), attr("Alfa", "Č")));
    assertThat(r.status()).isEqualTo(201);
    JsonNode read = api.get(owner.token(), contacts + "/" + r.json().get("id").asText()).json();
    assertThat(read.get("attributes").valueStream().map(a -> a.get("key").asText())).containsExactly("zadnji", "kompetenca", "Alfa");
    assertThat(read.get("attributes").get(1).get("value").asText()).isEqualTo("spletnoProgramiranje");
    assertThat(read.get("attributes").get(2).get("value").asText()).isEqualTo("Č");
  }

  @Test
  void AC_006_02_aKeyOutsideThePatternIsRejected() {
    for (String key : new String[] {"1abc", "ima presledek", "", "a".repeat(51), "šola", "a/b"}) {
      Api.Res r = create(List.of(attr("ok", "v"), attr(key, "v")));
      assertThat(r.status()).as(key).isEqualTo(400);
      assertThat(errorFields(r)).as(key).containsExactly("attributes[1].key");
    }
    assertThat(create(List.of(attr("a_b.c-d1", "v"))).status()).isEqualTo(201);
  }

  @Test
  void AC_006_03_twoKeysDifferingOnlyInLetterCaseAreRejectedForTheSecond() {
    Api.Res r = create(List.of(attr("Kompetenca", "a"), attr("kompetenca", "b")));
    assertThat(r.status()).isEqualTo(400);
    assertThat(errorFields(r)).containsExactly("attributes[1].key");
  }

  @Test
  void AC_006_04_aKeyEqualToAPredefinedFieldIdOrTagsIsRejected() {
    for (String key : new String[] {"email", "FIRSTNAME", "postalCode", "id", "Tags", "note"}) {
      Api.Res r = create(List.of(attr(key, "v")));
      assertThat(r.status()).as(key).isEqualTo(400);
      assertThat(errorFields(r)).as(key).containsExactly("attributes[0].key");
    }
  }

  @Test
  void AC_006_05_emptyOrOverlongValuesAndMoreThan100AttributesAreRejected() {
    Api.Res empty = create(List.of(attr("a", "   ")));
    assertThat(empty.status()).isEqualTo(400);
    assertThat(errorFields(empty)).containsExactly("attributes[0].value");
    Api.Res longValue = create(List.of(attr("a", "x".repeat(501))));
    assertThat(errorFields(longValue)).containsExactly("attributes[0].value");
    assertThat(create(List.of(attr("a", "x".repeat(500)))).status()).isEqualTo(201);
    List<Map<String, Object>> many = new ArrayList<>();
    for (int i = 0; i < 101; i++) many.add(attr("k" + i, "v"));
    Api.Res tooMany = create(many);
    assertThat(tooMany.status()).isEqualTo(400);
    assertThat(errorFields(tooMany)).containsExactly("attributes");
    assertThat(create(many.subList(0, 100)).status()).isEqualTo(201);
  }

  @Test
  void AC_006_06_anUpdateReplacesTheAttributesAsGiven() {
    JsonNode c = create(List.of(attr("a", "1"), attr("b", "2"))).json();
    String path = contacts + "/" + c.get("id").asText();
    Api.Res r = api.put(owner.token(), path, contact("version", 1, "firstName", "Ana", "attributes", List.of(attr("c", "3"), attr("a", "novo"))));
    assertThat(r.status()).isEqualTo(200);
    JsonNode read = api.get(owner.token(), path).json();
    assertThat(read.get("attributes").valueStream().map(a -> a.get("key").asText() + "=" + a.get("value").asText()))
        .containsExactly("c=3", "a=novo");
    api.put(owner.token(), path, contact("version", 2, "firstName", "Ana"));
    assertThat(api.get(owner.token(), path).json().get("attributes").size()).isZero();
  }
}
