import assert from "node:assert/strict";
import test from "node:test";
import { CSVService } from "../src/services/CSVService.ts";
import { ExportController } from "../src/controllers/ExportController.ts";

test("PDF opens the browser print workflow", (t) => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  let printed = false;
  globalThis.window = { print() { printed = true; } };
  assert.equal(ExportController.handleExport("exportPDF").success, true);
  assert.equal(printed, true);
});

test("CSV downloads UTF-8 data and releases the object URL on success and failure", async (t) => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  });
  let blob;
  let removed = 0;
  let clicked = 0;
  let cleanup;
  const revoked = [];
  t.mock.method(URL, "createObjectURL", (value) => { blob = value; return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", (url) => { revoked.push(url); });
  const anchor = { click() { clicked++; }, remove() { removed++; } };
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
  globalThis.window = { setTimeout(callback) { cleanup = callback; } };
  const tables = [{ querySelectorAll: () => [{ querySelectorAll: () => [{ textContent: "ação" }] }] }];
  assert.equal(CSVService.exportTablesToCSV(tables).success, true);
  assert.equal(clicked, 1);
  assert.equal(removed, 1);
  assert.equal(anchor.download, "exported_tables.csv");
  assert.equal(blob.type, "text/csv;charset=utf-8");
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)], [239, 187, 191]);
  assert.equal(await blob.text(), '"ação"');
  assert.deepEqual(revoked, []);
  cleanup();
  assert.deepEqual(revoked, ["blob:test"]);
  globalThis.document.body = null;
  assert.throws(() => CSVService.exportTablesToCSV(tables), /not ready/);
  assert.equal(removed, 2);
  assert.equal(revoked.length, 2);
});
