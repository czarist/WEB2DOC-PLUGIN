import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";
import { ContentRouter } from "../src/content/ContentRouter.ts";
import { readZip } from "../src/formats/zip.ts";
import { findTables, readTable, summarizeTable } from "../src/tables/TableService.ts";
import { describeTable, exportButtonLabel } from "../src/popup/TablePicker.ts";
import { isTableHighlightMessage, isTableListResult } from "../src/shared/messages.ts";

// Minimal element doubles: tables expose rows/cells/caption, headings expose text.
function heading(text: string) {
  return { tagName: "H2", textContent: text };
}

function table(rows: string[][], options: { caption?: string; ariaLabel?: string; visible?: boolean } = {}) {
  return {
    tagName: "TABLE",
    isConnected: true,
    rows: rows.map((cells) => ({ cells: cells.map((textContent) => ({ textContent })) })),
    caption: options.caption === undefined ? null : { textContent: options.caption },
    getAttribute: (name: string) => (name === "aria-label" ? options.ariaLabel ?? null : null),
    getClientRects: () => (options.visible === false ? [] : [{}])
  };
}

function page(...elements: unknown[]) {
  return { querySelectorAll: () => elements } as unknown as ParentNode;
}

test("reads a table's own rows with collapsed whitespace", () => {
  const data = table([["  Name ", "Population\n"], ["India", "1,463,865,525"]]);
  assert.deepEqual(readTable(data as unknown as HTMLTableElement), [["Name", "Population"], ["India", "1,463,865,525"]]);
});

test("finds visible tables with rows and titles them from captions, labels, or headings", () => {
  const found = findTables(page(
    heading("Population"),
    table([["Country", "People"], ["India", "1.4B"], ["China", "1.4B"]], { caption: "By country" }),
    table([["Hidden"]], { visible: false }),
    table([]),
    heading("  See   also "),
    table([["", ""], ["a", "b"]]),
    table([["x"]], { ariaLabel: "Totals" })
  ));

  assert.equal(found.length, 3);
  assert.deepEqual(found.map(summarizeTable), [
    { index: 0, title: "By country", rows: 3, columns: 2, preview: "Country · People" },
    { index: 1, title: "See also", rows: 2, columns: 2, preview: "a · b" },
    { index: 2, title: "Totals", rows: 1, columns: 1, preview: "x" }
  ]);
  const untitled = summarizeTable({ table: table([["1"]]) as unknown as HTMLTableElement, heading: "" }, 4);
  assert.equal(untitled.title, "Table 5");
});

test("truncates long titles and previews", () => {
  const long = "word ".repeat(40);
  const summary = summarizeTable({ table: table([[long]], { caption: long }) as unknown as HTMLTableElement, heading: "" }, 0);
  assert.ok(summary.title.length <= 80 && summary.title.endsWith("…"));
  assert.ok(summary.preview.length <= 90 && summary.preview.endsWith("…"));
});

const hooks = { startSelection: () => ({ success: true as const, message: "" }) };

/** A page double that records downloads made through a temporary link. */
function downloadingPage(t: import("node:test").TestContext, ...elements: unknown[]) {
  const downloads: Array<{ name: string; blob: Blob }> = [];
  let blob: Blob | undefined;
  t.mock.method(URL, "createObjectURL", (value: Blob) => { blob = value; return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", () => undefined);
  const anchor = { href: "", download: "", click() { if (blob) downloads.push({ name: anchor.download, blob }); }, remove() {} };
  stubGlobal(t, "document", {
    ...page(...elements),
    title: "Population data",
    documentElement: { lang: "en-US" },
    body: { appendChild() {} },
    createElement: () => anchor
  });
  stubGlobal(t, "window", { setTimeout: () => 0 });
  stubGlobal(t, "location", { href: "https://data.example/population", hostname: "data.example" });
  return downloads;
}

test("lists tables and exports only the chosen ones as CSV or Excel", async (t) => {
  const first = table([["a", "b"]]);
  const second = table([["Country", "Population"], ["Chad", "0019"], ["Peru", "1,234,567"]], { caption: "People" });
  const downloads = downloadingPage(t, heading("Data"), first, second);

  const list = await ContentRouter.handle({ action: "listTables" }, hooks);
  assert.equal(isTableListResult(list), true);
  assert.equal(list.message, "2 tables found.");

  assert.deepEqual(await ContentRouter.handle({ action: "exportTables", format: "csv", tables: [1] }, hooks),
    { success: true, message: "CSV download started for 1 table." });
  assert.equal(downloads[0]?.name, "Population data - tables.csv");
  const csvBytes = new Uint8Array(await (downloads[0]?.blob as Blob).arrayBuffer());
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "the CSV starts with a UTF-8 byte order mark");
  assert.equal(new TextDecoder().decode(csvBytes.slice(3)), '"Country","Population"\r\n"Chad","0019"\r\n"Peru","1,234,567"');

  // The popup's older CSV action keeps working.
  assert.equal((await ContentRouter.handle({ action: "exportCSV", tables: [0] }, hooks)).success, true);

  const excel = await ContentRouter.handle({ action: "exportTables", format: "xlsx", tables: [0, 1], convertValues: true }, hooks);
  assert.deepEqual(excel, { success: true, message: "Excel download started for 2 tables." });
  const workbook = readZip(new Uint8Array(await (downloads.at(-1)?.blob as Blob).arrayBuffer()));
  const xml = (name: string) => new TextDecoder().decode(workbook.find((entry) => entry.name === name)?.data);
  assert.match(xml("xl/workbook.xml"), /<sheet name="Data" sheetId="1"[^>]*\/><sheet name="People"/);
  assert.match(xml("xl/worksheets/sheet2.xml"), /<t xml:space="preserve">0019<\/t>/, "leading zeros stay text");
  assert.match(xml("xl/worksheets/sheet2.xml"), /<c r="B3"><v>1234567<\/v><\/c>/, "English numbers are converted");

  assert.match((await ContentRouter.handle({ action: "exportTables", format: "csv", tables: [] }, hooks)).message, /Select at least one/);
  assert.match((await ContentRouter.handle({ action: "exportTables", format: "csv", tables: ["1"] }, hooks)).message, /Select at least one/);
  assert.match((await ContentRouter.handle({ action: "exportTables", format: "csv", tables: [5] }, hooks)).message, /page changed/);
  second.isConnected = false;
  assert.match((await ContentRouter.handle({ action: "exportTables", format: "csv", tables: [1] }, hooks)).message, /page changed/);
  assert.deepEqual(await ContentRouter.handle({ action: "exportPDF" }, hooks), { success: false, message: "Unsupported export action." });
});

test("reports pages without tables", async (t) => {
  stubGlobal(t, "document", page(heading("Nothing here")));
  assert.deepEqual(await ContentRouter.handle({ action: "listTables" }, hooks), {
    success: false,
    message: "No HTML tables were found on this page."
  });
});

test("validates table list responses and highlight messages", () => {
  assert.equal(isTableListResult({ success: true, message: "1 table found." }), false);
  assert.equal(isTableListResult({ success: true, message: "", tables: [{ index: 0, title: "t", rows: 1, columns: 1, preview: "" }] }), true);
  assert.equal(isTableListResult({ success: true, message: "", tables: [{ index: "0" }] }), false);
  assert.equal(isTableListResult({ success: false, message: "No tables" }), true);

  assert.equal(isTableHighlightMessage({ selected: [0, 2], focused: null }), true);
  assert.equal(isTableHighlightMessage({ selected: [0], focused: 1 }), true);
  assert.equal(isTableHighlightMessage({ selected: [-1], focused: null }), false);
  assert.equal(isTableHighlightMessage({ selected: [], focused: 1.5 }), false);
  assert.equal(isTableHighlightMessage({ selected: [] }), false);
});

test("labels the picker's export button and table sizes", () => {
  assert.equal(exportButtonLabel(0), "Select tables");
  assert.equal(exportButtonLabel(1), "Export 1 table");
  assert.equal(exportButtonLabel(3), "Export 3 tables");
  assert.equal(describeTable({ index: 0, title: "", rows: 1, columns: 1, preview: "" }), "1 row × 1 column");
  assert.equal(describeTable({ index: 0, title: "", rows: 240, columns: 7, preview: "" }), "240 rows × 7 columns");
});
