import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";
import { ExportController } from "../src/controllers/ExportController.ts";
import { CSVService } from "../src/services/CSVService.ts";
import { findTables, readTable, summarizeTable } from "../src/services/TableService.ts";
import { describeTable, exportButtonLabel } from "../src/TablePicker.ts";
import { isTableHighlightMessage, isTableListResult } from "../src/types/ExportResult.ts";

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

test("lists tables and exports only the chosen ones", (t) => {
  const first = table([["a", "b"]]);
  const second = table([["c"]]);
  stubGlobal(t, "document", page(heading("Data"), first, second));
  const exported: unknown[] = [];
  // Replace the download with a recorder; CSV formatting and downloads have their own tests.
  t.mock.method(CSVService, "exportTablesToCSV", (tables: unknown) => {
    exported.push(tables);
    return { success: true, message: "ok" };
  });

  const list = ExportController.handleExport({ action: "listTables" });
  assert.equal(isTableListResult(list), true);
  assert.equal(list.message, "2 tables found.");

  assert.deepEqual(ExportController.handleExport({ action: "exportCSV", tables: [1] }), { success: true, message: "ok" });
  assert.deepEqual(exported, [[second]]);

  assert.match(ExportController.handleExport({ action: "exportCSV", tables: [] }).message, /Select at least one/);
  assert.match(ExportController.handleExport({ action: "exportCSV", tables: ["1"] }).message, /Select at least one/);
  assert.match(ExportController.handleExport({ action: "exportCSV", tables: [5] }).message, /page changed/);
  second.isConnected = false;
  assert.match(ExportController.handleExport({ action: "exportCSV", tables: [1] }).message, /page changed/);
});

test("reports pages without tables", (t) => {
  stubGlobal(t, "document", page(heading("Nothing here")));
  assert.deepEqual(ExportController.handleExport({ action: "listTables" }), {
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
