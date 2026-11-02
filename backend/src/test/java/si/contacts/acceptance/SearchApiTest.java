package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;
import tools.jackson.databind.JsonNode;

/** US-008: search, filter, sort and paging. */
class SearchApiTest extends ApiTestBase {
  TestUser owner;
  String w;
  String contacts;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Iskanje");
    contacts = "/api/workspaces/" + w + "/contacts";
  }

  String add(Object... kv) {
    return createContact(owner, w, contact(kv)).get("id").asText();
  }

  List<String> ids(String query) {
    Api.Res r = api.get(owner.token(), contacts + query);
    assertThat(r.status()).as(r.toString()).isEqualTo(200);
    return r.json().get("items").valueStream().map(i -> i.get("id").asText()).toList();
  }

  static String enc(String s) {
    return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
  }

  @Test
  void AC_008_01_searchIgnoresCaseAndDiacritics() {
    String sasa = add("firstName", "Saša", "lastName", "Đurić");
    String other = add("firstName", "Marko");
    assertThat(ids("?q=sasa")).containsExactly(sasa);
    assertThat(ids("?q=SAŠA")).containsExactly(sasa);
    assertThat(ids("?q=duric")).containsExactly(sasa);
    assertThat(ids("?q=" + enc("saša đurić"))).containsExactly(sasa);
    assertThat(ids("?q=mark")).containsExactly(other);
    assertThat(ids("?q=" + enc("%"))).isEmpty();
    assertThat(ids("?q=" + enc("\u0301"))).containsExactlyInAnyOrder(sasa, other);
  }

  @Test
  void AC_008_02_searchCoversExactlyNameEmailPhoneCompanyAndCity() {
    String byEmail = add("firstName", "A", "email", "posta@primer.si");
    String byPhone = add("firstName", "B", "phone", "+386 41 987 654");
    String byCompany = add("firstName", "C", "company", "Krka d.d.");
    String byCity = add("firstName", "D", "city", "Novo mesto");
    add("firstName", "E", "jobTitle", "skrito", "street", "skrito", "note", "skrito", "postalCode", "8000",
        "attributes", List.of(Map.of("key", "x", "value", "skrito")), "tags", List.of("skrito"));
    assertThat(ids("?q=primer.si")).containsExactly(byEmail);
    assertThat(ids("?q=987")).containsExactly(byPhone);
    assertThat(ids("?q=krka")).containsExactly(byCompany);
    assertThat(ids("?q=novo%20mesto")).containsExactly(byCity);
    assertThat(ids("?q=skrito")).isEmpty();
    assertThat(ids("?q=8000")).isEmpty();
  }

  @Test
  void AC_008_03_tagFiltersWithAllAndAny() {
    String ab = add("firstName", "AB", "tags", List.of("a", "b"));
    String a = add("firstName", "A", "tags", List.of("a"));
    String b = add("firstName", "B", "tags", List.of("B"));
    add("firstName", "N");
    assertThat(ids("?tag=a&tag=B")).containsExactly(ab);
    assertThat(ids("?tag=a&tag=b&tagMode=all")).containsExactly(ab);
    assertThat(ids("?tag=A&tag=b&tagMode=any")).containsExactlyInAnyOrder(ab, a, b);
    assertThat(ids("?tag=neznana")).isEmpty();
    assertThat(api.get(owner.token(), contacts + "?tagMode=none").status()).isEqualTo(400);
  }

  @Test
  void AC_008_04_attributeFiltersByKeyValueCaseInsensitivelyAndByKey() {
    String web = add("firstName", "W", "attributes", List.of(Map.of("key", "kompetenca", "value", "spletnoProgramiranje")));
    String other = add("firstName", "O", "attributes", List.of(Map.of("key", "Kompetenca", "value", "oblikovanje")));
    add("firstName", "N");
    assertThat(ids("?attr=" + enc("KOMPETENCA=spletnoprogramiranje"))).containsExactly(web);
    assertThat(ids("?attr=kompetenca")).containsExactlyInAnyOrder(web, other);
    assertThat(ids("?attr=kompetenca&attr=" + enc("kompetenca=oblikovanje"))).containsExactly(other);
  }

  @Test
  void AC_008_05_countryCompanyAndSearchTextCombineWithAnd() {
    String match = add("firstName", "Ana", "country", "SI", "company", "Krka");
    add("firstName", "Ana", "country", "AT", "company", "Krka");
    add("firstName", "Ana", "country", "SI", "company", "Lek");
    add("firstName", "Bor", "country", "SI", "company", "Krka");
    assertThat(ids("?country=si&company=KRKA&q=ana")).containsExactly(match);
  }

  @Test
  void AC_008_06_pagingWithTotalAndNoRepeatsAndSizeAbove100IsRejected() {
    for (int i = 0; i < 25; i++) add("firstName", "Ime" + i, "lastName", "Priimek" + (char) ('A' + (i % 26)));
    Set<String> seen = new HashSet<>();
    List<String> all = new ArrayList<>();
    for (int page = 0; page < 3; page++) {
      JsonNode r = api.get(owner.token(), contacts + "?size=10&page=" + page).json();
      assertThat(r.get("total").asInt()).isEqualTo(25);
      assertThat(r.get("page").asInt()).isEqualTo(page);
      r.get("items").valueStream().forEach(i -> {
        assertThat(seen.add(i.get("id").asText())).isTrue();
        all.add(i.get("lastName").asText());
      });
    }
    assertThat(seen).hasSize(25);
    assertThat(all).isSorted();
    Api.Res big = api.get(owner.token(), contacts + "?size=101");
    assertThat(big.status()).isEqualTo(400);
    assertThat(errorFields(big)).containsExactly("size");
    assertThat(api.get(owner.token(), contacts + "?size=100").status()).isEqualTo(200);
    assertThat(api.get(owner.token(), contacts + "?page=-1").status()).isEqualTo(400);
    assertThat(api.get(owner.token(), contacts + "?page=999999999").status()).isEqualTo(400);
    assertThat(api.get(owner.token(), contacts + "?page=abc").status()).isEqualTo(400);
  }

  @Test
  void sortsByFirstNameCompanyAndLastChange() {
    String c = add("firstName", "Cene", "company", "Alfa");
    String a = add("firstName", "Ana", "company", "Cveta");
    String b = add("firstName", "Bor", "company", "Beta");
    assertThat(ids("?sort=firstName")).containsExactly(a, b, c);
    assertThat(ids("?sort=firstName&dir=desc")).containsExactly(c, b, a);
    assertThat(ids("?sort=company")).containsExactly(c, b, a);
    api.put(owner.token(), contacts + "/" + a, contact("version", 1, "firstName", "Ana"));
    assertThat(ids("?sort=updatedAt").get(0)).isEqualTo(a);
    assertThat(api.get(owner.token(), contacts + "?sort=email").status()).isEqualTo(400);
  }

  @Test
  void AC_008_07_deletedContactsOnlyInTheDeletedView() {
    String active = add("firstName", "Aktiven");
    String gone = add("firstName", "Izbrisan");
    api.delete(owner.token(), contacts + "/" + gone);
    assertThat(ids("")).containsExactly(active);
    assertThat(ids("?deleted=true")).containsExactly(gone);
    assertThat(ids("?deleted=true&q=izbrisan")).containsExactly(gone);
    assertThat(ids("?q=izbrisan")).isEmpty();
  }
}
