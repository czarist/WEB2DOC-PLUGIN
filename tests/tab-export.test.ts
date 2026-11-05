import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";
import { exportActiveTab } from "../src/services/TabExportService.ts";
import { isExportResult } from "../src/types/ExportResult.ts";

test("validates responses from the content script", () => {
  for (const value of [null, undefined, [], "ok", {}, { success: "true", message: "ok" }, { success: true }]) {
    assert.equal(isExportResult(value), false);
  }
  assert.equal(isExportResult({ success: false, message: "No tables" }), true);
});

test("active tab export handles success, missing tabs, rejected APIs and invalid responses", async (t) => {
  const result = { success: true, message: "CSV download started." };
  const browser: { tabs: {
    query(options: chrome.tabs.QueryInfo): Promise<Array<{ id?: number }>>;
    sendMessage(id: number, message: unknown): Promise<unknown>;
  } } = { tabs: {
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
  stubGlobal(t, "chrome", browser);
  assert.deepEqual(await exportActiveTab("exportCSV"), result);
  browser.tabs.sendMessage = async () => null;
  assert.match((await exportActiveTab("exportCSV")).message, /invalid response/);
  browser.tabs.sendMessage = async () => { throw new Error("Restricted page"); };
  assert.match((await exportActiveTab("exportPDF")).message, /can't be accessed/);
  for (const tabs of [[], [{}]]) {
    browser.tabs.query = async () => tabs;
    assert.match((await exportActiveTab("exportCSV")).message, /Could not find/);
  }
  browser.tabs.query = async () => { throw new Error("Query failed"); };
  assert.equal((await exportActiveTab("exportPDF")).success, false);
});
