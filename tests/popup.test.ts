import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";

test("popup disables controls during export and restores them after a rejected message", async (t) => {
  class Button {
    disabled = false;
    click: (() => void) | undefined;
    addEventListener(_event: string, handler: () => void) { this.click = handler; }
  }
  const csv = new Button();
  const pdf = new Button();
  const status = { textContent: "", dataset: {} as Record<string, string> };
  let initialize: (() => void) | undefined;
  let rejectMessage: ((reason: Error) => void) | undefined;
  const elements: Record<string, Button | typeof status> = { exportCSV: csv, exportPDF: pdf, exportStatus: status };
  stubGlobal(t, "HTMLButtonElement", Button);
  stubGlobal(t, "document", {
    addEventListener(_event: string, handler: () => void) { initialize = handler; },
    getElementById(id: string) { return elements[id]; }
  });
  stubGlobal(t, "chrome", { tabs: {
    query: async () => [{ id: 1 }],
    sendMessage: () => new Promise((_resolve, reject) => { rejectMessage = reject; })
  } });
  await import("../src/popup.ts");
  assert.ok(initialize);
  initialize();
  assert.ok(csv.click);
  csv.click();
  assert.equal(csv.disabled, true);
  assert.equal(pdf.disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(rejectMessage);
  rejectMessage(new Error("No receiver"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(csv.disabled, false);
  assert.equal(pdf.disabled, false);
  assert.match(status.textContent, /can't be accessed/);
  assert.equal(status.dataset["state"], "error");
});
