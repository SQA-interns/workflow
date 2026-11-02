package si.contacts.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import si.contacts.support.Api;
import si.contacts.support.ApiTestBase;

/** US-012: Excel Export. */
class ExportApiTest extends ApiTestBase {
  static final List<String> FIXED =
      List.of("Ime", "Priimek", "E-pošta", "Telefon", "Podjetje", "Delovno mesto", "Ulica", "Poštna številka", "Kraj", "Država", "Opomba", "Oznake");
  TestUser owner;
  String w;
  String export;

  @BeforeEach
  void workspace() {
    owner = user("Owner");
    w = createWorkspace(owner, "Izvoz Škofja Loka");
    export = "/api/workspaces/" + w + "/export";
  }

  String add(Object... kv) {
    return createContact(owner, w, contact(kv)).get("id").asText();
  }

  static List<List<String>> rows(Api.Res r) throws Exception {
    assertThat(r.status()).as(r.toString()).isEqualTo(200);
    try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(r.bytes()))) {
      Sheet sheet = wb.getSheetAt(0);
      List<List<String>> out = new ArrayList<>();
      int width = sheet.getRow(0).getLastCellNum();
      for (Row row : sheet) {
        List<String> cells = new ArrayList<>();
        for (int i = 0; i < width; i++) {
          Cell c = row.getCell(i);
          if (c != null) assertThat(c.getCellType()).isIn(CellType.STRING, CellType.BLANK);
          cells.add(c == null ? "" : c.getStringCellValue());
        }
        out.add(cells);
      }
      return out;
    }
  }

  @Test
  void AC_012_01_aSelectionExportContainsExactlyThoseContactsInListOrder() throws Exception {
    String c = add("firstName", "Cene", "lastName", "Cerar");
    String a = add("firstName", "Ana", "lastName", "Avsec");
    add("firstName", "Bor", "lastName", "Bizjak");
    List<List<String>> rows = rows(api.post(owner.token(), export, Map.of("contactIds", List.of(c, a))));
    assertThat(rows).hasSize(3);
    assertThat(rows.get(1).subList(0, 2)).containsExactly("Ana", "Avsec");
    assertThat(rows.get(2).subList(0, 2)).containsExactly("Cene", "Cerar");
  }

  @Test
  void AC_012_02_aFilterExportContainsEveryMatchingContactInTheFiltersOrder() throws Exception {
    add("firstName", "Ana", "tags", List.of("vip"), "company", "Alfa");
    add("firstName", "Bor", "tags", List.of("vip"), "company", "Cveta");
    add("firstName", "Cene", "company", "Beta");
    String gone = add("firstName", "Dan", "tags", List.of("vip"));
    api.delete(owner.token(), "/api/workspaces/" + w + "/contacts/" + gone);
    List<List<String>> rows = rows(api.post(owner.token(), export, Map.of("filter", Map.of("tag", List.of("VIP"), "sort", "company", "dir", "desc"))));
    assertThat(rows.stream().skip(1).map(r -> r.get(0))).containsExactly("Bor", "Ana");
    List<List<String>> all = rows(api.post(owner.token(), export, Map.of("filter", Map.of())));
    assertThat(all).hasSize(4);
  }

  @Test
  void AC_012_03_fixedColumnsInContractOrderThenAttributeColumnsLowerCaseSortedAndTagsJoined() throws Exception {
    add("firstName", "Ana", "lastName", "Kos", "email", "ana@example.si", "phone", "041 1", "company", "Krka", "jobTitle", "Vodja",
        "street", "Cesta 1", "postalCode", "8000", "city", "Novo mesto", "country", "SI", "note", "Opomba",
        "tags", List.of("vip", "udelezenec2025"), "attributes", List.of(Map.of("key", "Zeta", "value", "z"), Map.of("key", "alfa", "value", "a")));
    add("firstName", "Bor", "attributes", List.of(Map.of("key", "ZETA", "value", "z2"), Map.of("key", "mid", "value", "m")));
    List<List<String>> rows = rows(api.post(owner.token(), export, Map.of("filter", Map.of())));
    List<String> header = new ArrayList<>(FIXED);
    header.addAll(List.of("alfa", "mid", "zeta"));
    assertThat(rows.get(0)).containsExactlyElementsOf(header);
    assertThat(rows.get(1)).containsExactly("Ana", "Kos", "ana@example.si", "041 1", "Krka", "Vodja", "Cesta 1", "8000", "Novo mesto", "SI", "Opomba",
        "vip, udelezenec2025", "a", "", "z");
    assertThat(rows.get(2).subList(12, 15)).containsExactly("", "m", "z2");
  }

  @Test
  void AC_012_04_slovenianCharactersAndFormulaLikeValuesAreExportedUnchangedAsText() throws Exception {
    add("firstName", "=SUM(A1:A2)", "lastName", "Čuček", "company", "+cmd|' /C calc'!A0", "city", "-2+3", "note", "@SUM(1)",
        "jobTitle", "čšž ČŠŽ ćđ");
    List<List<String>> rows = rows(api.post(owner.token(), export, Map.of("filter", Map.of())));
    List<String> r = rows.get(1);
    assertThat(r.get(0)).isEqualTo("=SUM(A1:A2)");
    assertThat(r.get(1)).isEqualTo("Čuček");
    assertThat(r.get(4)).isEqualTo("+cmd|' /C calc'!A0");
    assertThat(r.get(5)).isEqualTo("čšž ČŠŽ ćđ");
    assertThat(r.get(8)).isEqualTo("-2+3");
    assertThat(r.get(10)).isEqualTo("@SUM(1)");
  }

  @Test
  void theFileIsNamedAfterTheWorkspaceAndTheDate() {
    add("firstName", "A");
    Api.Res r = api.post(owner.token(), export, Map.of("filter", Map.of()));
    assertThat(r.header("Content-Type")).startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    String date = LocalDate.now(java.time.ZoneId.of("Europe/Ljubljana")).toString();
    assertThat(r.header("Content-Disposition"))
        .contains("filename=\"Izvoz-Skofja-Loka-" + date + ".xlsx\"")
        .contains("filename*=UTF-8''Izvoz-%C5%A0kofja-Loka-" + date + ".xlsx");
  }

  @Test
  void AC_012_05_invalidExportRequestsAreRejected() {
    String a = add("firstName", "A");
    String gone = add("firstName", "B");
    api.delete(owner.token(), "/api/workspaces/" + w + "/contacts/" + gone);
    String other = createWorkspace(owner, "Drugi");
    String foreign = createContact(owner, other, contact("firstName", "F")).get("id").asText();
    List<Object> bad = List.of(
        Map.of(),
        Map.of("contactIds", List.of(a), "filter", Map.of()),
        Map.of("contactIds", List.of()),
        Map.of("contactIds", List.of(gone)),
        Map.of("contactIds", List.of(a, foreign)),
        Map.of("contactIds", List.of("not-a-uuid")),
        Map.of("filter", Map.of("sort", "nonsense")));
    for (Object body : bad) assertThat(api.post(owner.token(), export, body).status()).as(body.toString()).isEqualTo(400);
  }

  @Test
  void AC_012_07_viewersCanExport() throws Exception {
    TestUser viewer = user("Viewer");
    addMember(owner, w, viewer, "VIEWER");
    String a = add("firstName", "A");
    assertThat(rows(api.post(viewer.token(), export, Map.of("contactIds", List.of(a))))).hasSize(2);
  }
}
