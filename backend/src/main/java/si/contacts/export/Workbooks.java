package si.contacts.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import si.contacts.contact.Attribute;
import si.contacts.contact.Contact;
import si.contacts.contact.Fields;

/** Writes Contacts as an .xlsx workbook: fixed columns, then one per Attribute key; every cell text. */
public final class Workbooks {
  public static final List<String> HEADERS =
      List.of("Ime", "Priimek", "E-pošta", "Telefon", "Podjetje", "Delovno mesto", "Ulica", "Poštna številka", "Kraj", "Država", "Opomba", "Oznake");

  private Workbooks() {}

  public static byte[] write(List<Contact> contacts) {
    TreeMap<String, Integer> attrColumns = new TreeMap<>();
    for (Contact c : contacts)
      for (Attribute a : c.state().attributes()) attrColumns.putIfAbsent(a.key().toLowerCase(Locale.ROOT), 0);
    int i = HEADERS.size();
    for (Map.Entry<String, Integer> e : attrColumns.entrySet()) e.setValue(i++);

    try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
      CellStyle text = wb.createCellStyle();
      text.setDataFormat(wb.createDataFormat().getFormat("@"));
      Sheet sheet = wb.createSheet("Kontakti");
      List<String> header = new ArrayList<>(HEADERS);
      header.addAll(attrColumns.keySet());
      Row h = sheet.createRow(0);
      for (int col = 0; col < header.size(); col++) cell(h, col, header.get(col), text);
      int r = 1;
      for (Contact c : contacts) {
        Row row = sheet.createRow(r++);
        int col = 0;
        for (String f : Fields.PREDEFINED) cell(row, col++, c.state().field(f), text);
        cell(row, col, String.join(", ", c.state().tags()), text);
        for (Attribute a : c.state().attributes()) cell(row, attrColumns.get(a.key().toLowerCase(Locale.ROOT)), a.value(), text);
      }
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      wb.write(out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Always a string cell: a value starting with = + - @ is never interpreted as a formula. */
  private static void cell(Row row, int col, String value, CellStyle style) {
    var cell = row.createCell(col);
    cell.setCellStyle(style);
    cell.setCellValue(value == null ? "" : value);
  }
}
