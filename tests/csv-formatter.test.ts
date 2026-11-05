import assert from "node:assert/strict";
import test from "node:test";
import { formatTablesAsCSV } from "../src/services/CSVFormatter.ts";
import { CSVService } from "../src/services/CSVService.ts";
import { ExportController } from "../src/controllers/ExportController.ts";

test("returns an empty string when there are no tables", () => {
  assert.equal(formatTablesAsCSV([]), "");
});

test("reports when a page has no exportable HTML tables", () => {
  assert.deepEqual(CSVService.exportTablesToCSV([]), {
    success: false,
    message: "No HTML tables were found on this page."
  });
});

test("escapes quotes and keeps commas and line breaks inside fields", () => {
  const csv = formatTablesAsCSV([
    [
      ['He said "go"', "São Paulo, SP"],
      ["first line\nsecond line", "ação"]
    ]
  ]);

  assert.equal(
    csv,
    '\uFEFF"He said ""go""","São Paulo, SP"\r\n"first line\nsecond line","ação"'
  );
});

test("separates multiple tables with a blank CSV row", () => {
  const csv = formatTablesAsCSV([
    [["Table one"]],
    [["Table two"]]
  ]);

  assert.equal(csv, '\uFEFF"Table one"\r\n\r\n"Table two"');
});

test("rejects unsupported export actions explicitly", () => {
  assert.deepEqual(ExportController.handleExport("unknown"), {
    success: false,
    message: "Unsupported export action."
  });
});
