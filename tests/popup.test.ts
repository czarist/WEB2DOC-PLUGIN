import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";

test("popup disables controls during export, restores them after failures, and closes once the page tools open", async (t) => {
  class Button {
    disabled = false;
    dataset: Record<string, string> = {};
    click: (() => void) | undefined;
    addEventListener(_event: string, handler: () => void) { this.click = handler; }
  }
  class Select {}
  const csv = new Button();
  const pdf = new Button();
  const select = new Button();
  const area = new Button();
  const archive = Object.assign(new Button(), { dataset: { tabAction: "saveArchive" } });
  const status = { textContent: "", dataset: {} as Record<string, string> };
  let closed = 0;
  let initialize: (() => void) | undefined;
  let rejectMessage: ((reason: Error) => void) | undefined;
  const elements: Record<string, unknown> = { exportCSV: csv, exportPDF: pdf, selectPDF: select, selectArea: area, exportStatus: status };
  stubGlobal(t, "HTMLButtonElement", Button);
  stubGlobal(t, "HTMLSelectElement", Select);
  stubGlobal(t, "document", {
    addEventListener(_event: string, handler: () => void) { initialize = handler; },
    getElementById(id: string) { return elements[id]; },
    querySelectorAll(selector: string) {
      if (selector === "#mainView button") return [csv, pdf, select, area, archive];
      if (selector === "[data-tab-action]") return [archive];
      return [];
    }
  });
  stubGlobal(t, "window", { close: () => { closed++; } });
  const tabs: { query(): Promise<Array<{ id: number }>>; sendMessage(id: number, message: unknown): Promise<unknown> } = {
    query: async () => [{ id: 1 }],
    sendMessage: () => new Promise((_resolve, reject) => { rejectMessage = reject; })
  };
  const sentToBackground: unknown[] = [];
  stubGlobal(t, "chrome", { tabs, runtime: { sendMessage: async (message: unknown) => { sentToBackground.push(message); return { success: true, message: "Offline archive download started." }; } } });
  await import("../src/popup/popup.ts");
  assert.ok(initialize);
  initialize();
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  assert.ok(csv.click);
  csv.click();
  assert.equal(csv.disabled, true);
  assert.equal(pdf.disabled, true);
  assert.equal(archive.disabled, true);
  await tick();
  assert.ok(rejectMessage);
  rejectMessage(new Error("No receiver"));
  await tick();
  assert.equal(csv.disabled, false);
  assert.equal(pdf.disabled, false);
  assert.match(status.textContent, /can't be accessed/);
  assert.equal(status.dataset["state"], "error");

  // Pages that cannot run the content script keep the popup open with an explanation.
  assert.ok(select.click);
  tabs.sendMessage = async () => { throw new Error("Could not establish connection"); };
  select.click();
  assert.equal(select.disabled, true);
  await tick();
  assert.equal(select.disabled, false);
  assert.match(status.textContent, /can't be accessed.*reload the page/);
  assert.equal(closed, 0);

  // Once the tools open on the page, the popup closes so the page can be clicked.
  const sent: unknown[] = [];
  tabs.sendMessage = async (_id, message) => { sent.push(message); return { success: true, message: "ok" }; };
  select.click();
  await tick();
  area.click?.();
  await tick();
  assert.deepEqual(sent, [{ action: "startSelection" }, { action: "startSelection", mode: "area" }]);
  assert.equal(closed, 2);

  // Tools that need the debugger are sent to the background with the active tab.
  archive.click?.();
  await tick();
  assert.deepEqual(sentToBackground, [{ action: "saveArchive", tabId: 1 }]);
  assert.equal(status.dataset["state"], "success");
});
