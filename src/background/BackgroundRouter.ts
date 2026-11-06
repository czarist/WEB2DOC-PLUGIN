// Routes requests that need privileged extension APIs (debugger, downloads, tabs).
// - Extension pages (the popup, options and batch pages) may act on any tab they name.
// - The content script may act only on its own tab, from the top frame, after the user
//   prepared a selection there.
// Webpages cannot reach this listener: the extension does not declare externally_connectable.

import { cleanFileName, fileName } from "../shared/files";
import {
  isDownloadRequest,
  isSelectionImageRequest,
  type DownloadRequest,
  isSelectionPDFRequest,
  isTabRequest,
  type ExportResult,
  type SelectionImageRequest,
  type TabRequest
} from "../shared/messages";
import { addHistory, findPreset, getPreferences, saveSnapshot, type Preferences } from "../shared/settings";
import { ExportError, exportImages, exportTab, imageToPdf } from "./ExportEngine";
import { CaptureError, captureImage, captureViewport, downloadData, pdfFileName, PagePDFService, type PDFCaptureOptions } from "./PageCaptureService";

export interface Sender {
  id?: string | undefined;
  tab?: { id?: number | undefined } | undefined;
  frameId?: number | undefined;
  url?: string | undefined;
}

export type SavePDF = (tabId: number, options?: PDFCaptureOptions) => Promise<ExportResult>;

/** Everything the router does outside itself; tests replace these. */
export interface RouterServices {
  savePDF: SavePDF;
  preferences(): Promise<Preferences>;
  handleTab(request: TabRequest, preferences: Preferences): Promise<ExportResult>;
  handleImage(tabId: number, request: SelectionImageRequest, preferences: Preferences): Promise<ExportResult>;
  /** Saves a file the page built; the name is cleaned again here. */
  download(request: DownloadRequest): Promise<ExportResult>;
}

function failure(error: unknown, prefix: string): ExportResult {
  if (error instanceof ExportError || error instanceof CaptureError) return { success: false, message: error.message };
  return { success: false, message: `${prefix}: ${error instanceof Error ? error.message : "Unknown error"}` };
}

async function record(result: ExportResult, details: { title: string; url: string; format: string; fileName: string }): Promise<ExportResult> {
  await addHistory({ ...details, success: result.success, message: result.message }).catch(() => undefined);
  return result;
}

/** Opens one of the extension's tool pages with data passed through session storage. */
async function openToolPage(page: "ocr.html" | "compare.html", key: string, value: unknown): Promise<void> {
  await chrome.storage.session.set({ [key]: value });
  await chrome.tabs.create({ url: chrome.runtime.getURL(page) });
}

// Session storage holds up to 10 MB; base64 images for text recognition must fit.
const OCR_IMAGE_LIMIT = 9 * 1024 * 1024;

async function openOcr(image: { data: string; title: string; url: string }): Promise<ExportResult> {
  if (image.data.length > OCR_IMAGE_LIMIT) {
    return { success: false, message: "The image is too large for text recognition. Choose a smaller area." };
  }
  await openToolPage("ocr.html", "ocrImage", { base64: image.data, title: image.title, url: image.url, at: new Date().toISOString() });
  return { success: true, message: "Text recognition opened in a new tab." };
}

/** A page-built file name, cleaned again: no folders, no unsafe characters, extension kept. */
export function safeDownloadName(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).replace(/[^a-z0-9]/gi, "").slice(0, 8) : "";
  const base = cleanFileName(dot >= 0 ? name.slice(0, dot) : name) || "page";
  return extension ? `${base}.${extension}` : base;
}

export const defaultServices: RouterServices = {
  savePDF: (tabId, options) => PagePDFService.savePageAsPDF(tabId, options),
  download: (request) => downloadData(request.base64, request.mimeType, safeDownloadName(request.fileName)),
  preferences: () => getPreferences(),

  async handleTab(request, preferences) {
    const { tabId } = request;
    try {
      switch (request.action) {
        case "exportPDF": {
          const file = await exportTab(tabId, { scope: "page", format: "pdf" }, preferences);
          const result = await downloadData(file.base64, file.mimeType, file.fileName);
          return record(result.success ? { success: true, message: "PDF download started." } : { success: false, message: "The PDF was created but the download could not start." },
            { title: file.title ?? "", url: file.url ?? "", format: "pdf", fileName: file.fileName });
        }
        case "saveArchive": {
          const file = await exportTab(tabId, { scope: "page", format: "mhtml" }, preferences);
          const result = await downloadData(file.base64, file.mimeType, file.fileName);
          return record(result.success ? { success: true, message: "Offline archive download started." } : result, { title: file.title ?? "", url: file.url ?? "", format: "mhtml", fileName: file.fileName });
        }
        case "exportImages": {
          const file = await exportImages(tabId, preferences);
          const result = await downloadData(file.base64, file.mimeType, file.fileName);
          return record(result.success ? { success: true, message: `ZIP download started with ${file.count} ${file.count === 1 ? "image" : "images"}.` } : result,
            { title: file.fileName, url: "", format: "zip", fileName: file.fileName });
        }
        case "ocrVisible": {
          const shot = await captureViewport(tabId);
          return openOcr(shot);
        }
        case "compareCapture": {
          const page = await chrome.tabs.sendMessage(tabId, { action: "pageText" }).catch(() => undefined) as
            { success?: boolean; text?: string; title?: string; url?: string; message?: string } | undefined;
          if (!page?.success || typeof page.text !== "string") {
            return { success: false, message: page?.message ?? "This page can't be accessed. Open a regular webpage and try again." };
          }
          const current = { url: page.url ?? "", title: page.title ?? "", at: new Date().toISOString(), text: page.text };
          const previous = await saveSnapshot(current);
          if (!previous) return { success: true, message: "Saved this page for comparison. Run Compare again after it changes." };
          await openToolPage("compare.html", "comparison", { previous, current });
          return { success: true, message: "The comparison opened in a new tab." };
        }
        case "runPreset": {
          const preset = await findPreset(request.presetId);
          if (!preset) return { success: false, message: "That preset no longer exists." };
          const file = await exportTab(tabId, preset.job, preferences);
          const result = await downloadData(file.base64, file.mimeType, file.fileName);
          return record(result.success ? { success: true, message: `${preset.name}: download started.` } : result,
            { title: file.title ?? file.fileName, url: file.url ?? "", format: preset.job.format, fileName: file.fileName });
        }
      }
    } catch (error) {
      return failure(error, "The export failed");
    }
  },

  async handleImage(tabId, request, preferences) {
    try {
      const image = await captureImage(tabId, request.rect ? { rect: request.rect } : {});
      if (request.kind === "ocr") return openOcr(image);
      const name = request.fileName.trim() || fileName(preferences.fileNamePattern, { title: image.title, url: image.url }, request.kind === "png" ? "png" : "pdf");
      if (request.kind === "png") {
        const result = await downloadData(image.data, "image/png", name.replace(/\.(pdf|png)$/i, "") + ".png");
        return record(result.success ? { success: true, message: "Image download started." } : result, { title: image.title, url: image.url, format: "png", fileName: name });
      }
      const pdf = await imageToPdf(image.data, image.scale, image.title);
      const result = await downloadData(pdf, "application/pdf", pdfFileName(name));
      return record(result.success ? { success: true, message: "PDF download started." } : result, { title: image.title, url: image.url, format: "pdf", fileName: name });
    } catch (error) {
      return failure(error, "The capture failed");
    }
  }
};

export function routeBackgroundMessage(
  message: unknown,
  sender: Sender,
  runtimeId: string,
  services: Partial<RouterServices> = {}
): Promise<ExportResult> | undefined {
  if (sender.id !== runtimeId) return undefined;
  const use: RouterServices = { ...defaultServices, ...services };
  const fromExtensionPage = sender.tab === undefined;
  const ownTab = sender.tab?.id !== undefined && sender.frameId === 0 ? sender.tab.id : undefined;

  let task: (() => Promise<ExportResult>) | undefined;
  if (fromExtensionPage && isTabRequest(message)) {
    if (message.action === "exportPDF" && services.savePDF) {
      const save = services.savePDF;
      task = () => save(message.tabId);
    } else {
      task = async () => use.handleTab(message, await use.preferences());
    }
  } else if (ownTab !== undefined && isSelectionPDFRequest(message)) {
    task = async () => {
      const preferences = await use.preferences().catch(() => undefined);
      return use.savePDF(ownTab, {
        fileName: message.fileName,
        ...(preferences ? { headerFooter: preferences.pdfHeaderFooter, qrCode: preferences.pdfQrCode } : {})
      });
    };
  } else if (ownTab !== undefined && isSelectionImageRequest(message)) {
    task = async () => use.handleImage(ownTab, message, await use.preferences());
  } else if (ownTab !== undefined && isDownloadRequest(message)) {
    task = () => use.download(message);
  }

  return task?.().catch((error: unknown): ExportResult => failure(error, "PDF capture failed"));
}
