import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { ExportError, batchReport, batchZip, combinePdfs, exportTab, imageToPdf, isExportableUrl } from "../src/background/ExportEngine.ts";
import { PREPARE_PAGE_SCRIPT, RESTORE_PAGE_SCRIPT, captureImage, headerFooterTemplates, imageScale, type PDFBrowserApi } from "../src/background/PageCaptureService.ts";
import { base64ToBytes, bytesToBase64 } from "../src/shared/files.ts";
import { readZip } from "../src/formats/zip.ts";
import { DEFAULT_PREFERENCES } from "../src/shared/settings.ts";

function debuggerDouble(responses: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; params?: object }> = [];
  let attached = 0;
  let detached = 0;
  const browser: PDFBrowserApi = {
    debugger: {
      async attach() { attached++; },
      async detach() { detached++; },
      async sendCommand(_target, method, params) {
        calls.push(params === undefined ? { method } : { method, params });
        if (method === "Runtime.evaluate") {
          const expression = (params as { expression: string }).expression;
          if (expression === PREPARE_PAGE_SCRIPT) return { result: { value: { title: "Article", width: 800 } } };
          if (expression === "location.href") return { result: { value: "https://news.example/story" } };
          if (expression in responses) return { result: { value: responses[expression] } };
          return { result: { value: null } };
        }
        if (method === "Page.printToPDF") return { data: "JVBERi0=" };
        if (method === "Page.captureScreenshot") return { data: "iVBORw0=" };
        return {};
      }
    },
    downloads: { async download() { return 1; } }
  };
  return { browser, calls, counts: () => ({ attached, detached }) };
}

test("a clean article PDF prepares the main content, captures it and always restores the page", async () => {
  const fake = debuggerDouble();
  const messages: object[] = [];
  const file = await exportTab(7, { scope: "main", format: "pdf" }, { ...DEFAULT_PREFERENCES, pdfHeaderFooter: true, pdfQrCode: true, fileNamePattern: "{title} - {host}" }, {
    browser: fake.browser,
    sendToTab: async (_tabId, message) => {
      messages.push(message);
      return { success: true, message: "ready" };
    }
  });
  assert.deepEqual(messages, [{ action: "prepareCapture", scope: "main" }, { action: "restoreCapture" }]);
  assert.deepEqual(file, { fileName: "Article - news.example.pdf", mimeType: "application/pdf", base64: "JVBERi0=", title: "Article", url: "https://news.example/story" });
  const print = fake.calls.find((call) => call.method === "Page.printToPDF")?.params as Record<string, unknown>;
  assert.equal(print["displayHeaderFooter"], true);
  assert.equal(print["marginTop"], 0.8);
  assert.match(String(print["headerTemplate"]), /class="title".*class="url".*data:image\/svg\+xml;base64,/s);
  assert.match(String(print["footerTemplate"]), /class="pageNumber".*class="totalPages"/s);
  assert.deepEqual(fake.counts(), { attached: 1, detached: 1 });

  // The page is restored even when the capture fails.
  const failing = debuggerDouble();
  failing.browser.debugger.sendCommand = async (_target, method) => {
    if (method === "Runtime.evaluate") return { exceptionDetails: {} };
    return {};
  };
  const restored: object[] = [];
  await assert.rejects(exportTab(7, { scope: "main", format: "pdf" }, DEFAULT_PREFERENCES, {
    browser: failing.browser,
    sendToTab: async (_tabId, message) => { restored.push(message); return { success: true, message: "ok" }; }
  }), /could not be prepared/);
  assert.deepEqual(restored.at(-1), { action: "restoreCapture" });
});

test("exports run in the page for documents and tables, and report pages that cannot be reached", async () => {
  const built = await exportTab(3, { scope: "tables", format: "xlsx", convertValues: true }, DEFAULT_PREFERENCES, {
    sendToTab: async (_tabId, message) => {
      assert.deepEqual(message, { action: "buildFile", job: { scope: "tables", format: "xlsx", convertValues: true } });
      return { success: true, message: "", fileName: "Data.xlsx", mimeType: "application/zip", base64: "UEs=" };
    }
  });
  assert.equal(built.fileName, "Data.xlsx");
  await assert.rejects(exportTab(3, { scope: "main", format: "markdown" }, DEFAULT_PREFERENCES, {
    sendToTab: async () => { throw new Error("Could not establish connection"); }
  }), (error: unknown) => error instanceof ExportError && /can't be accessed/.test(error.message));
  await assert.rejects(exportTab(3, { scope: "main", format: "markdown" }, DEFAULT_PREFERENCES, {
    sendToTab: async () => ({ success: false, message: "No HTML tables were found on this page." })
  }), /No HTML tables/);
  await assert.rejects(exportTab(3, { scope: "tables", format: "pdf" }, DEFAULT_PREFERENCES), /Tables export to CSV or Excel/);
});

test("captures a selection or a drawn area as an image at a sharp but bounded scale", async () => {
  assert.equal(imageScale({ x: 0, y: 0, width: 800, height: 600 }), 2);
  assert.equal(imageScale({ x: 0, y: 0, width: 800, height: 40_000 }), 0.4);
  assert.equal(imageScale({ x: 0, y: 0, width: 100_000, height: 10 }), 0.25);

  const fake = debuggerDouble({ "document.title": "Area page" });
  const area = await captureImage(5, { rect: { x: 10, y: 20, width: 300, height: 200 }, browser: fake.browser });
  assert.equal(area.title, "Area page");
  assert.deepEqual(fake.calls.find((call) => call.method === "Page.captureScreenshot")?.params,
    { format: "png", captureBeyondViewport: true, clip: { x: 10, y: 20, width: 300, height: 200, scale: 2 } });
  assert.equal(fake.calls.some((call) => (call.params as { expression?: string } | undefined)?.expression === PREPARE_PAGE_SCRIPT), false,
    "a drawn area is captured as it was drawn");

  const selection = debuggerDouble();
  await assert.rejects(captureImage(5, { browser: selection.browser }), /no longer on the page/);
  assert.equal((selection.calls.at(-1)?.params as { expression?: string }).expression, RESTORE_PAGE_SCRIPT, "the page is restored after a failed capture");
});

test("builds image PDFs, combined PDFs and batch archives with a report", async () => {
  // A 2 × 1 PNG.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEJMAIAIKQB/2Xv1CwAAAAASUVORK5CYII=";
  const imagePdf = await PDFDocument.load(base64ToBytes(await imageToPdf(png, 2, "Area")));
  assert.equal(imagePdf.getTitle(), "Area");
  assert.deepEqual(imagePdf.getPage(0).getSize(), { width: 0.75, height: 0.375 });

  const one = await PDFDocument.create();
  one.addPage();
  const two = await PDFDocument.create();
  two.addPage();
  two.addPage();
  const items = [
    { title: "One", fileName: "One.pdf", mimeType: "application/pdf", base64: bytesToBase64(await one.save()) },
    { title: "Two", fileName: "One.pdf", mimeType: "application/pdf", base64: bytesToBase64(await two.save()) },
    { title: "Notes", fileName: "Notes.md", mimeType: "text/markdown", base64: bytesToBase64(new TextEncoder().encode("# Notes")) }
  ];
  const combined = await PDFDocument.load(base64ToBytes(await combinePdfs(items, "Batch")));
  assert.equal(combined.getPageCount(), 3);
  assert.equal(combined.getTitle(), "Batch");

  const report = batchReport("Clean article", [
    { title: "One", url: "https://a.example", state: "done", message: "One.pdf", fileName: "One.pdf" },
    { title: "Store", url: "https://chromewebstore.google.com/x", state: "failed", message: "This page can't be accessed." }
  ]);
  assert.match(report, /Exported: 1 of 2/);
  assert.match(report, /FAILED Store\n {7}https:\/\/chromewebstore.google.com\/x\n {7}This page can't be accessed./);
  const zip = readZip(base64ToBytes(batchZip(items, report)));
  assert.deepEqual(zip.map((entry) => entry.name), ["One.pdf", "One (2).pdf", "Notes.md", "report.txt"]);

  assert.equal(isExportableUrl("https://example.com"), true);
  assert.equal(isExportableUrl("file:///C:/a.html"), true);
  for (const url of ["chrome://settings", "chrome-extension://abc/batch.html", "https://chromewebstore.google.com/detail/x", "about:blank", ""]) {
    assert.equal(isExportableUrl(url), false, url);
  }
  assert.match(headerFooterTemplates("https://x.example", false).headerTemplate, /class="url"/);
  assert.doesNotMatch(headerFooterTemplates("https://x.example", false).headerTemplate, /<img/);
});
