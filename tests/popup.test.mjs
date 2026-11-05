import assert from "node:assert/strict";
import test from "node:test";

test("popup disables controls during export and restores them after a rejected message", async (t) => {
  const keys = ["document", "chrome", "HTMLButtonElement"];
  const previous = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  class Button {
    disabled = false;
    addEventListener(_event, handler) { this.click = handler; }
  }
  const csv = new Button();
  const pdf = new Button();
  const status = { textContent: "" };
  let initialize;
  let rejectMessage;
  globalThis.HTMLButtonElement = Button;
  globalThis.document = {
    addEventListener(_event, handler) { initialize = handler; },
    getElementById(id) { return { exportCSV: csv, exportPDF: pdf, exportStatus: status }[id]; }
  };
  globalThis.chrome = { tabs: {
    query: async () => [{ id: 1 }],
    sendMessage: () => new Promise((_resolve, reject) => { rejectMessage = reject; })
  } };
  await import("../src/popup.ts");
  initialize();
  csv.click();
  assert.equal(csv.disabled, true);
  assert.equal(pdf.disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  rejectMessage(new Error("No receiver"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(csv.disabled, false);
  assert.equal(pdf.disabled, false);
  assert.match(status.textContent, /can't be accessed/);
});
