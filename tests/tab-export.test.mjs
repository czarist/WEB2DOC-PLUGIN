import assert from "node:assert/strict";
import test from "node:test";
import { exportActiveTab } from "../src/services/TabExportService.ts";
import { isExportResult } from "../src/types/ExportResult.ts";

test("validates responses from the content script", () => {
  for (const value of [null, undefined, [], "ok", {}, { success: "true", message: "ok" }, { success: true }]) {
    assert.equal(isExportResult(value), false);
  }
  assert.equal(isExportResult({ success: false, message: "No tables" }), true);
});

test("active tab export handles success, missing tabs, rejected APIs and invalid responses", async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  const result = { success: true, message: "CSV download started." };
  globalThis.chrome = { tabs: {
    query: async (options) => {
      assert.deepEqual(options, { active: true, currentWindow: true });
      return [{ id: 0 }];
    },
    sendMessage: async (id, message) => {
      assert.equal(id, 0);
      assert.deepEqual(message, { action: "exportCSV" });
      return result;
    }
  } };
  assert.deepEqual(await exportActiveTab("exportCSV"), result);
  globalThis.chrome.tabs.sendMessage = async () => null;
  assert.match((await exportActiveTab("exportCSV")).message, /invalid response/);
  globalThis.chrome.tabs.sendMessage = async () => { throw new Error("Restricted page"); };
  assert.match((await exportActiveTab("exportPDF")).message, /can't be accessed/);
  for (const tabs of [[], [{}]]) {
    globalThis.chrome.tabs.query = async () => tabs;
    assert.match((await exportActiveTab("exportCSV")).message, /Could not find/);
  }
  globalThis.chrome.tabs.query = async () => { throw new Error("Query failed"); };
  assert.equal((await exportActiveTab("exportPDF")).success, false);
});
