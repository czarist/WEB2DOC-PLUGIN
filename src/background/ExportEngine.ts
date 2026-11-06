// Runs an export job for a tab and returns the file, without downloading it. Presets,
// keyboard shortcuts, the context menu and batch exports all go through here.

import { PDFDocument } from "pdf-lib";
import { createZip, utf8 } from "../formats/zip";
import { base64ToBytes, bytesToBase64, fileName, mimeType } from "../shared/files";
import { isExportResult, isFileResult, type ExportJob, type FileResult } from "../shared/messages";
import { presetProblem, type Preferences } from "../shared/settings";
import { CaptureError, captureArchive, capturePageImages, capturePDF, type PDFBrowserApi } from "./PageCaptureService";

export interface TabFile {
  fileName: string;
  mimeType: string;
  base64: string;
  /** Page title and address, when the capture knows them. */
  title?: string;
  url?: string;
}

/** A failure whose message is meant for the user. */
export class ExportError extends Error {}

const NO_ACCESS = "This page can't be accessed. Browser pages, the extension store, and pages opened before Web2Doc was installed are not supported; reload the page or open a regular webpage and try again.";

export interface EngineApi {
  sendToTab(tabId: number, message: object): Promise<unknown>;
  browser?: PDFBrowserApi;
}

const defaultApi: EngineApi = {
  sendToTab: (tabId, message) => chrome.tabs.sendMessage(tabId, message)
};

async function askTab(api: EngineApi, tabId: number, message: object): Promise<unknown> {
  try {
    return await api.sendToTab(tabId, message);
  } catch {
    throw new ExportError(NO_ACCESS);
  }
}

function userMessage(error: unknown): string {
  if (error instanceof ExportError || error instanceof CaptureError) return error.message;
  return `The export failed: ${error instanceof Error ? error.message : "Unknown error"}`;
}

export async function exportTab(tabId: number, job: ExportJob, preferences: Preferences, api: EngineApi = defaultApi): Promise<TabFile> {
  const problem = presetProblem(job);
  if (problem) throw new ExportError(problem);
  const pattern = preferences.fileNamePattern;
  const pdfOptions = { headerFooter: preferences.pdfHeaderFooter, qrCode: preferences.pdfQrCode, ...(api.browser ? { browser: api.browser } : {}) };

  try {
    if (job.format === "pdf") {
      if (job.scope === "main") {
        const ready = await askTab(api, tabId, { action: "prepareCapture", scope: "main" });
        if (!isExportResult(ready)) throw new ExportError("The page returned an invalid response. Reload it and try again.");
        if (!ready.success) throw new ExportError(ready.message);
        try {
          const pdf = await capturePDF(tabId, pdfOptions);
          return { fileName: fileName(pattern, { title: pdf.title, url: pdf.url }, "pdf"), mimeType: mimeType("pdf"), base64: pdf.data, title: pdf.title, url: pdf.url };
        } finally {
          await api.sendToTab(tabId, { action: "restoreCapture" }).catch(() => undefined);
        }
      }
      const pdf = await capturePDF(tabId, pdfOptions);
      return { fileName: fileName(pattern, { title: pdf.title, url: pdf.url }, "pdf"), mimeType: mimeType("pdf"), base64: pdf.data, title: pdf.title, url: pdf.url };
    }
    if (job.format === "mhtml") {
      const archive = await captureArchive(tabId, api.browser);
      return { fileName: fileName(pattern, { title: archive.title, url: archive.url }, "mhtml"), mimeType: "multipart/related", base64: bytesToBase64(utf8(archive.data)), title: archive.title, url: archive.url };
    }
    const built = await askTab(api, tabId, { action: "buildFile", job });
    if (!isFileResult(built)) throw new ExportError("The page returned an invalid response. Reload it and try again.");
    if (!built.success) throw new ExportError(built.message);
    return { fileName: built.fileName, mimeType: built.mimeType, base64: built.base64 };
  } catch (error) {
    throw new ExportError(userMessage(error));
  }
}

/** The page's image files in a ZIP archive. */
export async function exportImages(tabId: number, preferences: Preferences, browser?: PDFBrowserApi): Promise<TabFile & { count: number }> {
  const { title, url, images } = await capturePageImages(tabId, browser);
  if (images.length === 0) throw new ExportError("No images were found on this page.");
  const used = new Set<string>();
  const entries = images.map((image, index) => {
    const extension = (/image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)/.exec(image.mimeType)?.[1] ?? "bin")
      .replace("svg+xml", "svg").replace("jpeg", "jpg").replace(/x-icon|vnd\.microsoft\.icon/, "ico");
    let base = `image-${index + 1}`;
    if (!image.url.startsWith("data:")) {
      try {
        const last = decodeURIComponent(new URL(image.url).pathname.split("/").pop() ?? "");
        base = last.replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 80) || base;
      } catch {
        // keep the numbered name
      }
    }
    let name = `${base}.${extension}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).${extension}`;
    used.add(name.toLowerCase());
    return { name, data: base64ToBytes(image.base64) };
  });
  const sources = images.map((image, index) => `${entries[index]?.name}\t${image.url}`).join("\n");
  entries.push({ name: "sources.txt", data: utf8(`Images from ${url}\nCaptured ${new Date().toISOString()}\n\n${sources}\n`) });
  return {
    fileName: fileName(preferences.fileNamePattern, { title, url, label: "images" }, "zip"),
    mimeType: mimeType("zip"),
    base64: bytesToBase64(createZip(entries)),
    count: images.length
  };
}

/** Wraps a PNG in a one-page PDF sized to the image. */
export async function imageToPdf(pngBase64: string, scale: number, title: string): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Web2Doc");
  const image = await pdf.embedPng(base64ToBytes(pngBase64));
  // CSS pixels to points: 72 / 96.
  const width = (image.width / scale) * 0.75;
  const height = (image.height / scale) * 0.75;
  const page = pdf.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return bytesToBase64(await pdf.save());
}

export interface BatchItem {
  title: string;
  fileName: string;
  base64: string;
  mimeType: string;
}

/** Combines PDFs into one, in order. Files that are not PDFs are left out. */
export async function combinePdfs(items: readonly BatchItem[], title: string): Promise<string> {
  const combined = await PDFDocument.create();
  combined.setTitle(title);
  combined.setCreator("Web2Doc");
  for (const item of items) {
    if (item.mimeType !== "application/pdf") continue;
    const source = await PDFDocument.load(base64ToBytes(item.base64), { ignoreEncryption: true });
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  return bytesToBase64(await combined.save());
}

/** Bundles the completed files of a batch in a ZIP, with a report of every tab. */
export function batchZip(items: readonly BatchItem[], report: string): string {
  const used = new Set<string>();
  const entries = items.map((item) => {
    let name = item.fileName;
    const dot = name.lastIndexOf(".");
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${item.fileName.slice(0, dot)} (${n})${item.fileName.slice(dot)}`;
    used.add(name.toLowerCase());
    return { name, data: base64ToBytes(item.base64) };
  });
  entries.push({ name: "report.txt", data: utf8(report) });
  return bytesToBase64(createZip(entries));
}

export function fileResult(file: TabFile, message: string): FileResult {
  return { success: true, message, fileName: file.fileName, mimeType: file.mimeType, base64: file.base64 };
}

/** Pages the content script and debugger can work on. */
export function isExportableUrl(url: string): boolean {
  return /^(https?|file):/i.test(url) && !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url);
}

/** A plain-text report of every tab in the batch. */
export function batchReport(preset: string, results: ReadonlyArray<{ title: string; url: string; state: string; message: string; fileName?: string }>): string {
  const lines = results.map((result) => `${result.state === "done" ? "OK    " : "FAILED"} ${result.title || result.url}\n       ${result.url}\n       ${result.state === "done" ? result.fileName ?? "" : result.message}`);
  const done = results.filter((result) => result.state === "done").length;
  return `Web2Doc batch export\nPreset: ${preset}\nDate: ${new Date().toISOString()}\nExported: ${done} of ${results.length}\n\n${lines.join("\n\n")}\n`;
}
