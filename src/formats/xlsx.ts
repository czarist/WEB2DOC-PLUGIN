// Writes Office Open XML spreadsheets (.xlsx) without dependencies. Text is always written
// as inline strings, never as formulas, so page text that starts with "=", "+", "-" or "@"
// stays plain text.

import type { CellValue, NumberFormat } from "./cellValues";
import { createZip, utf8 } from "./zip";

export interface Sheet {
  name: string;
  rows: readonly (readonly CellValue[])[];
  /** The first row holds column headers: it is frozen and gets filter buttons. */
  header: boolean;
}

export interface WorkbookInfo {
  title?: string;
  source?: string;
  created?: Date;
}

const MAX_CELL_TEXT = 32767;
const MAX_SHEET_NAME = 31;

/** Removes characters XML 1.0 does not allow and escapes markup. */
export function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Valid, unique worksheet names (31 characters, no : \ / ? * [ ], unique ignoring case). */
export function sheetNames(titles: readonly string[]): string[] {
  const used = new Set<string>(["history"]);
  return titles.map((title, index) => {
    const base = title.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "")
      || `Table ${index + 1}`;
    let name = base.slice(0, MAX_SHEET_NAME).trim();
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, MAX_SHEET_NAME - suffix.length).trim()}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Collects the number formats a workbook needs and maps each to a cell style index. */
class StyleTable {
  // Style 0: default. Style 1: bold header text.
  private readonly formats: string[] = [];
  private readonly styleByKey = new Map<string, number>();

  style(value: CellValue): number {
    if (value.kind === "text") return 0;
    if (value.kind === "date") return this.custom(value.withTime ? "yyyy-mm-dd hh:mm" : "yyyy-mm-dd");
    return this.number(value.format);
  }

  private number(format: NumberFormat): number {
    if (format === "general") return 0;
    if (format === "percent") return this.custom("0.00%");
    const symbol = format.currency.replace(/"/g, "");
    return this.custom(`"${symbol}" #,##0.00;-"${symbol}" #,##0.00`);
  }

  private custom(code: string): number {
    const existing = this.styleByKey.get(code);
    if (existing !== undefined) return existing;
    this.formats.push(code);
    const style = this.formats.length + 1;
    this.styleByKey.set(code, style);
    return style;
  }

  xml(): string {
    const numFmts = this.formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlText(code)}"/>`).join("");
    const xfs = this.formats.map((_code, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
  this.formats.length ? `<numFmts count="${this.formats.length}">${numFmts}</numFmts>` : ""}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${2 + this.formats.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

function cellXml(value: CellValue, ref: string, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (value.kind === "text") {
    if (value.text === "") return style ? `<c r="${ref}"${s}/>` : "";
    const text = xmlText(value.text.slice(0, MAX_CELL_TEXT));
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${text}</t></is></c>`;
  }
  const number = value.kind === "date" ? value.serial : value.value;
  return `<c r="${ref}"${s}><v>${String(number)}</v></c>`;
}

function textLength(value: CellValue): number {
  if (value.kind === "text") return Math.max(...value.text.split("\n").map((line) => line.length), 0);
  if (value.kind === "date") return value.withTime ? 16 : 10;
  return String(value.value).length + (value.format === "general" ? 0 : 4);
}

function worksheetXml(sheet: Sheet, styles: StyleTable): string {
  const rows = sheet.rows;
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const lastRef = `${columnName(columns - 1)}${Math.max(1, rows.length)}`;
  const freeze = sheet.header && rows.length > 1;

  const widths = Array.from({ length: columns }, (_v, c) =>
    Math.min(60, Math.max(8, ...rows.map((row) => (row[c] ? textLength(row[c]) : 0) + 2))));
  const cols = widths.map((width, c) => `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`).join("");

  const data = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const style = sheet.header && r === 0 ? 1 : styles.style(value);
      return cellXml(value, `${columnName(c)}${r + 1}`, style);
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");

  const view = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter = freeze ? `<autoFilter ref="A1:${lastRef}"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastRef}"/>${view}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${data}</sheetData>${filter}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

function isoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Builds a workbook with one worksheet per sheet. Sheet names must already be valid and unique. */
export function createXlsx(sheets: readonly Sheet[], info: WorkbookInfo = {}): Uint8Array {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet.");
  const styles = new StyleTable();
  const worksheets = sheets.map((sheet) => worksheetXml(sheet, styles));
  const created = info.created ?? new Date();

  const sheetEntries = sheets.map((sheet, i) => `<sheet name="${xmlText(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const definedNames = sheets
    .map((sheet, i) => {
      if (!sheet.header || sheet.rows.length < 2) return "";
      const columns = Math.max(1, ...sheet.rows.map((row) => row.length));
      const quoted = `'${sheet.name.replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlText(quoted)}!$A$1:$${columnName(columns - 1)}$${sheet.rows.length}</definedName>`;
    })
    .join("");

  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
  sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(info.title ?? "")}</dc:title><dc:description>${xmlText(info.source ? `Source: ${info.source}` : "")}</dc:description><dc:creator>Web2Doc</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${isoTimestamp(created)}</dcterms:created></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Web2Doc</Application></Properties>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetEntries}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ""}</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
  sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  };
  worksheets.forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = xml; });
  files["xl/styles.xml"] = styles.xml();

  return createZip(Object.entries(files).map(([name, xml]) => ({ name, data: utf8(xml) })), { date: created });
}
