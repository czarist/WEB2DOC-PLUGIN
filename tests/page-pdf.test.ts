import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";
import {
  PagePDFService,
  PREPARE_PAGE_SCRIPT,
  RESTORE_PAGE_SCRIPT,
  pdfFileName,
  pdfScale,
  type PDFBrowserApi
} from "../src/services/PagePDFService.ts";
import { exportActiveTab } from "../src/services/TabExportService.ts";

interface Call { method: string; params?: object }

function fakeBrowser(options: {
  attachError?: Error;
  prepared?: unknown;
  pdf?: string;
  printError?: Error;
  downloadError?: Error;
} = {}) {
  const calls: Call[] = [];
  const downloads: Array<{ url: string; filename: string }> = [];
  let detached = 0;
  const browser: PDFBrowserApi = {
    debugger: {
      async attach(target, version) {
        assert.deepEqual(target, { tabId: 7 });
        assert.equal(version, "1.3");
        if (options.attachError) throw options.attachError;
      },
      async detach() { detached++; },
      async sendCommand(_target, method, params) {
        calls.push(params === undefined ? { method } : { method, params });
        if (method === "Runtime.evaluate" && (params as { expression: string }).expression === PREPARE_PAGE_SCRIPT) {
          return { result: { value: "prepared" in options ? options.prepared : { title: "Report: Q3/2026", width: 1434 } } };
        }
        if (method === "Page.printToPDF") {
          if (options.printError) throw options.printError;
          return { data: options.pdf ?? "JVBERi0=" };
        }
        return {};
      }
    },
    downloads: {
      async download(request) {
        if (options.downloadError) throw options.downloadError;
        downloads.push(request);
        return 1;
      }
    }
  };
  return { browser, calls, downloads, detached: () => detached };
}

test("captures the page with screen styles and downloads a named PDF", async () => {
  const fake = fakeBrowser();
  const result = await PagePDFService.savePageAsPDF(7, fake.browser);

  assert.deepEqual(result, { success: true, message: "PDF download started." });
  assert.deepEqual(fake.calls.map((call) => call.method), [
    "Runtime.evaluate",
    "Emulation.setEmulatedMedia",
    "Page.printToPDF",
    "Emulation.setEmulatedMedia",
    "Runtime.evaluate"
  ]);
  assert.deepEqual(fake.calls[1]?.params, { media: "screen" });
  const print = fake.calls[2]?.params as Record<string, unknown>;
  assert.equal(print["printBackground"], true);
  assert.equal(print["generateDocumentOutline"], true);
  assert.equal(print["scale"], pdfScale(1434));
  assert.deepEqual(fake.calls[3]?.params, { media: "" });
  assert.deepEqual(fake.calls[4]?.params, { expression: RESTORE_PAGE_SCRIPT });
  assert.equal(fake.detached(), 1);
  assert.deepEqual(fake.downloads, [{ url: "data:application/pdf;base64,JVBERi0=", filename: "Report Q3 2026.pdf" }]);
});

test("reports restricted pages and open DevTools without capturing", async () => {
  const restricted = fakeBrowser({ attachError: new Error("Cannot access a chrome:// URL") });
  assert.match((await PagePDFService.savePageAsPDF(7, restricted.browser)).message, /can't be captured/);
  assert.equal(restricted.calls.length, 0);
  assert.equal(restricted.detached(), 0);

  const devtools = fakeBrowser({ attachError: new Error("Another debugger is already attached to the tab with id: 7.") });
  assert.match((await PagePDFService.savePageAsPDF(7, devtools.browser)).message, /Close DevTools/);
});

test("restores the page and detaches when capture fails", async () => {
  for (const options of [{ printError: new Error("Printing failed") }, { pdf: "" }, { prepared: null }]) {
    const fake = fakeBrowser(options);
    const result = await PagePDFService.savePageAsPDF(7, fake.browser);
    assert.equal(result.success, false);
    assert.match(result.message, /PDF capture failed/);
    assert.equal(fake.detached(), 1);
    assert.deepEqual(fake.calls.at(-1), { method: "Runtime.evaluate", params: { expression: RESTORE_PAGE_SCRIPT } });
    assert.equal(fake.downloads.length, 0);
  }

  const blocked = fakeBrowser({ downloadError: new Error("Download blocked") });
  assert.match((await PagePDFService.savePageAsPDF(7, blocked.browser)).message, /download could not start/);
  assert.equal(blocked.detached(), 1);
});

test("builds safe PDF file names and fit-to-width scales", () => {
  assert.equal(pdfFileName('a/b\\c:d*e?"f<g>h|i'), "a b c d e f g h i.pdf");
  assert.equal(pdfFileName("  ...  "), "page.pdf");
  assert.equal(pdfFileName("x".repeat(300)).length, 124);
  assert.equal(pdfScale(717), 1);
  assert.equal(pdfScale(1434), 0.5);
  assert.equal(pdfScale(100000), 0.1);
  assert.equal(pdfScale(0), 1);
});

test("the popup sends PDF requests to the background service worker", async (t) => {
  const sent: unknown[] = [];
  const browser = {
    tabs: { query: async () => [{ id: 7 }], sendMessage: async () => { throw new Error("not used"); } },
    runtime: { sendMessage: async (message: unknown): Promise<unknown> => { sent.push(message); return { success: true, message: "PDF download started." }; } }
  };
  stubGlobal(t, "chrome", browser);

  assert.deepEqual(await exportActiveTab("exportPDF"), { success: true, message: "PDF download started." });
  assert.deepEqual(sent, [{ action: "exportPDF", tabId: 7 }]);

  browser.runtime.sendMessage = async () => null;
  assert.match((await exportActiveTab("exportPDF")).message, /invalid response/);
  browser.runtime.sendMessage = async () => { throw new Error("No service worker"); };
  assert.match((await exportActiveTab("exportPDF")).message, /could not start the PDF capture/);
});
