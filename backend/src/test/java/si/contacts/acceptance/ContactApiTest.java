package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-005: Contacts with Predefined fields, Revisions and version checks. */
class ContactApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Kontakti");
    contacts = "/api/workspaces/" + w + "/contacts";
  }

  static Map<String, Object> full() {
    return contact(
        "firstName", "Saša", "lastName", "Novak", "email", "sasa.novak@example.si", "phone", "+386 41 123 456",
        "company", "Podjetje d.o.o.", "jobTitle", "Vodja projektov", "street", "Slovenska cesta 1",
        "postalCode", "1000", "city", "Ljubljana", "country", "SI", "note", "Srečala na konferenci.");
  }

  @Test
  void AC_005_01_aValidContactIsCreatedWithVersion1AndEveryValueStored() {
    Api.Res r = api.post(owner.token(), contacts, full());
    assertThat(r.status()).isEqualTo(201);
    JsonNode c = r.json();
    assertThat(c.get("version").asInt()).isEqualTo(1);
    assertThat(c.get("deleted").asBoolean()).isFalse();
    full().forEach((k, v) -> assertThat(c.get(k).asText()).as(k).isEqualTo(v));
    JsonNode read = api.get(owner.token(), contacts + "/" + c.get("id").asText()).json();
    full().forEach((k, v) -> assertThat(read.get(k).asText()).as(k).isEqualTo(v));
    assertThat(read.get("version").asInt()).isEqualTo(1);
  }

  @Test
  void AC_005_02_aContactWithoutFirstNameLastNameAndEmailIsRejected() {
    Api.Res r = api.post(owner.token(), contacts, contact("company", "Samo podjetje", "firstName", "   "));
    assertThat(r.status()).isEqualTo(400);
    assertThat(errorFields(r)).contains("firstName");
    for (String only : new String[] {"firstName", "lastName", "email"}) {
      Object value = only.equals("email") ? "a@example.si" : "Ime";
      assertThat(api.post(owner.token(), contacts, contact(only, value)).status()).as(only).isEqualTo(201);
    }
  }

  @Test
  void AC_005_03_leadingAndTrailingSpacesAreRemovedAndBlankValuesBecomeAbsent() {
    JsonNode c = createContact(owner, w, contact("firstName", "  Ana  ", "lastName", "\tKos ", "city", "   "));
    assertThat(c.get("firstName").asText()).isEqualTo("Ana");
    assertThat(c.get("lastName").asText()).isEqualTo("Kos");
    assertThat(c.get("city").isNull()).isTrue();
  }

  @Test
  void AC_005_04_invalidEmailUnknownCountryOrOverlongValuesAreRejectedWithTheFieldsError() {
    Api.Res r =
        api.post(
            owner.token(),
            contacts,
            contact("firstName", "x".repeat(101), "email", "ni-email", "country", "XX", "note", "n".repeat(2001)));
    assertThat(r.status()).isEqualTo(400);
    assertThat(errorFields(r)).containsExactlyInAnyOrder("firstName", "email", "country", "note");
    JsonNode c = createContact(owner, w, contact("firstName", "Ana", "country", "si"));
    assertThat(c.get("country").asText()).isEqualTo("SI");
    assertThat(api.post(owner.token(), contacts, contact("firstName", 12)).status()).isEqualTo(400);
  }

  @Test
  void AC_005_05_slovenianCharactersSurviveUnchanged() {
    String text = "čšž ČŠŽ ćđ ĆĐ";
    JsonNode c = createContact(owner, w, contact("firstName", "Čedomir", "lastName", "Šuštaršič", "city", "Žalec", "note", text));
    JsonNode read = api.get(owner.token(), contacts + "/" + c.get("id").asText()).json();
    assertThat(read.get("firstName").asText()).isEqualTo("Čedomir");
    assertThat(read.get("lastName").asText()).isEqualTo("Šuštaršič");
    assertThat(read.get("city").asText()).isEqualTo("Žalec");
    assertThat(read.get("note").asText()).isEqualTo(text);
  }

  @Test
  void AC_005_06_anUpdateNamingTheCurrentVersionIsAppliedAndAnOutdatedVersionGets409() {
    JsonNode c = createContact(owner, w, contact("firstName", "Ana"));
    String path = contacts + "/" + c.get("id").asText();
    Map<String, Object> body = contact("version", 1, "firstName", "Ana", "lastName", "Kos");
    Api.Res ok = api.put(owner.token(), path, body);
    assertThat(ok.status()).isEqualTo(200);
    assertThat(ok.json().get("version").asInt()).isEqualTo(2);
    assertThat(ok.json().get("lastName").asText()).isEqualTo("Kos");
    Api.Res stale = api.put(owner.token(), path, contact("version", 1, "firstName", "Stara"));
    assertThat(stale.status()).isEqualTo(409);
    JsonNode now = api.get(owner.token(), path).json();
    assertThat(now.get("firstName").asText()).isEqualTo("Ana");
    assertThat(now.get("version").asInt()).isEqualTo(2);
    Api.Res missing = api.put(owner.token(), path, contact("firstName", "Brez"));
    assertThat(missing.status()).isEqualTo(400);
    assertThat(errorFields(missing)).containsExactly("version");
  }

  @Test
  void AC_005_07_deleteHidesTheContactAndWritesADeleteRevision() {
    JsonNode c = createContact(owner, w, contact("firstName", "Brisani"));
    String id = c.get("id").asText();
    assertThat(api.delete(owner.token(), contacts + "/" + id + "?version=1").status()).isEqualTo(204);
    JsonNode list = api.get(owner.token(), contacts).json();
    assertThat(list.get("items").valueStream().map(i -> i.get("id").asText())).doesNotContain(id);
    JsonNode read = api.get(owner.token(), contacts + "/" + id).json();
    assertThat(read.get("deleted").asBoolean()).isTrue();
    assertThat(read.get("version").asInt()).isEqualTo(2);
    JsonNode revs = api.get(owner.token(), contacts + "/" + id + "/revisions").json();
    assertThat(revs.get(0).get("type").asText()).isEqualTo("DELETE");
    assertThat(revs.get(0).get("number").asInt()).isEqualTo(2);
    assertThat(api.delete(owner.token(), contacts + "/" + id).status()).isEqualTo(409);
  }

  @Test
  void deleteWithAnOutdatedVersionGets409() {
    String id = createContact(owner, w, contact("firstName", "X")).get("id").asText();
    api.put(owner.token(), contacts + "/" + id, contact("version", 1, "firstName", "Y"));
    assertThat(api.delete(owner.token(), contacts + "/" + id + "?version=1").status()).isEqualTo(409);
    Api.Res bad = api.delete(owner.token(), contacts + "/" + id + "?version=abc");
    assertThat(bad.status()).isEqualTo(400);
    assertThat(errorFields(bad)).containsExactly("version");
  }

  @Test
  void AC_005_08_aViewerCannotCreateUpdateDeleteOrRestore() {
    TestUser viewer = user("Viewer");
    addMember(owner, w, viewer, "VIEWER");
    String id = createContact(owner, w, contact("firstName", "Ana")).get("id").asText();
    String path = contacts + "/" + id;
    assertThat(api.post(viewer.token(), contacts, contact("firstName", "V")).status()).isEqualTo(403);
    assertThat(api.put(viewer.token(), path, contact("version", 1, "firstName", "V")).status()).isEqualTo(403);
    assertThat(api.delete(viewer.token(), path).status()).isEqualTo(403);
    assertThat(api.post(viewer.token(), path + "/restore", null).status()).isEqualTo(403);
    assertThat(api.post(viewer.token(), path + "/revisions/1/restore", Map.of("version", 1)).status()).isEqualTo(403);
    assertThat(api.get(viewer.token(), path).status()).isEqualTo(200);
    assertThat(api.get(viewer.token(), path).json().get("version").asInt()).isEqualTo(1);
  }

  @Test
  void anEditorCanChangeContacts() {
    TestUser editor = user("Editor");
    addMember(owner, w, editor, "EDITOR");
    String id = createContact(editor, w, contact("firstName", "Ana")).get("id").asText();
    assertThat(api.put(editor.token(), contacts + "/" + id, contact("version", 1, "firstName", "Ana B")).status()).isEqualTo(200);
    assertThat(api.delete(editor.token(), contacts + "/" + id).status()).isEqualTo(204);
  }

  @Test
  void anUnknownContactGets404() {
    assertThat(api.get(owner.token(), contacts + "/" + java.util.UUID.randomUUID()).status()).isEqualTo(404);
    assertThat(api.get(owner.token(), contacts + "/nope").status()).isEqualTo(404);
  }
}
