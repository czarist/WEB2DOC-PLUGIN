// Captures a tab through the DevTools protocol (chrome.debugger): PDFs with screen styles,
// PNG images of the page or part of it, MHTML archives with embedded resources, and the
// page's image files. The debugger is attached only for the duration of one capture.

import type { ExportResult, PageRect } from "../shared/messages";
import { cleanFileName } from "../shared/files";
import { sourceQrSvg } from "../shared/qr";

/** The parts of the extension APIs this service uses; tests replace them with doubles. */
export interface PDFBrowserApi {
  debugger: {
    attach(target: { tabId: number }, version: string): Promise<void>;
    detach(target: { tabId: number }): Promise<void>;
    sendCommand(target: { tabId: number }, method: string, params?: object): Promise<unknown>;
  };
  downloads: {
    download(options: { url: string; filename: string; saveAs?: boolean }): Promise<number>;
  };
}

interface PreparedPage {
  title: string;
  width: number;
}

export interface PDFCaptureOptions {
  /** File name chosen by the user; defaults to the page title. */
  fileName?: string;
  /** Page title and address at the top of each page, date and page numbers at the bottom. */
  headerFooter?: boolean;
  /** A QR code linking to the source page in the header. */
  qrCode?: boolean;
  browser?: PDFBrowserApi;
}

export interface CapturedFile {
  data: string;
  /** Page title, used for the file name. */
  title: string;
  url: string;
}

// A4 with 0.4 in margins. The page is laid out at its on-screen width and scaled to fit.
const PAPER_WIDTH_IN = 8.27;
const PAPER_HEIGHT_IN = 11.69;
const MARGIN_IN = 0.4;
const HEADER_MARGIN_IN = 0.8;
const CSS_PX_PER_IN = 96;

/**
 * Runs in the page before capture: loads lazy content by scrolling through the page,
 * waits for images and fonts, and unpins fixed and sticky elements so they are not
 * repeated on every PDF page. Returns the page title and layout width.
 */
export const PREPARE_PAGE_SCRIPT = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const root = document.scrollingElement || document.documentElement;
  const restore = [];

  for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = "eager";

  const deadline = Date.now() + 8000;
  let y = 0;
  while (y < root.scrollHeight && Date.now() < deadline) {
    window.scrollTo(0, y);
    y += Math.max(window.innerHeight, 400);
    await sleep(120);
  }
  window.scrollTo(0, 0);

  const pending = Array.from(document.images)
    .filter((image) => !image.complete)
    .map((image) => new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    }));
  await Promise.race([Promise.all([...pending, document.fonts.ready]), sleep(5000)]);

  for (const element of document.querySelectorAll("body *")) {
    const position = getComputedStyle(element).position;
    if (position === "fixed" || position === "sticky") {
      // Write the attribute directly: Chromium syncs element.style changes into the attribute
      // lazily, so removing the attribute later could still leave an empty style="" behind.
      const original = element.getAttribute("style");
      restore.push([element, original]);
      const pinned = "position: " + (position === "fixed" ? "absolute" : "relative") + " !important;";
      element.setAttribute("style", original ? original + "; " + pinned : pinned);
    }
  }
  // Web2Doc's own outlines and messages are never part of a capture.
  for (const overlay of document.querySelectorAll("web2doc-selection, web2doc-table-highlight")) {
    const original = overlay.getAttribute("style");
    restore.push([overlay, original]);
    overlay.setAttribute("style", (original ? original + "; " : "") + "display: none !important;");
  }
  window.__web2docRestore = () => {
    // Put the style attribute back exactly, including removing it when the page had none.
    for (const [element, style] of restore) {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }
    delete window.__web2docRestore;
  };

  return { title: document.title, width: document.documentElement.clientWidth || window.innerWidth };
})()`;

export const RESTORE_PAGE_SCRIPT = "window.__web2docRestore && window.__web2docRestore()";

/** The prepared selection's area in page coordinates. */
export const TARGET_RECT_SCRIPT = `(() => {
  const target = document.querySelector("[data-web2doc-target]");
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
})()`;

/** Turns a page title or a typed file name into a safe PDF file name. */
export function pdfFileName(title: string): string {
  return `${cleanFileName(title.replace(/\.pdf\s*$/i, "")) || "page"}.pdf`;
}

/** Scale that fits the on-screen layout width into the printable page width. */
export function pdfScale(layoutWidth: number): number {
  const printable = (PAPER_WIDTH_IN - 2 * MARGIN_IN) * CSS_PX_PER_IN;
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return 1;
  return Math.min(1, Math.max(0.1, Math.round((printable / layoutWidth) * 1000) / 1000));
}

/** Screenshot scale: sharp (2x) for small areas, smaller for very large ones. */
export function imageScale(rect: PageRect, preferred = 2): number {
  const limit = Math.min(preferred, 8000 / rect.width, 16000 / rect.height);
  return Math.max(0.25, Math.round(limit * 100) / 100);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Header and footer templates; Chrome fills the title, url, date and page number classes. */
export function headerFooterTemplates(url: string, qrCode: boolean): { headerTemplate: string; footerTemplate: string } {
  const style = "font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 8px; color: #555; width: 100%; margin: 0 0.4in;";
  const qr = qrCode ? `<img alt="" style="height: 0.5in; width: 0.5in; flex: none;" src="data:image/svg+xml;base64,${btoa(sourceQrSvg(url))}">` : "";
  return {
    headerTemplate: `<div style="${style} display: flex; align-items: center; gap: 12px;"><div style="flex: 1; min-width: 0; overflow: hidden;"><div class="title" style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div><div class="url" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div></div>${qr}</div>`,
    footerTemplate: `<div style="${style} display: flex; justify-content: space-between;"><span class="date"></span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
  };
}

function attachFailure(error: unknown): ExportResult {
  const details = error instanceof Error ? error.message : String(error);
  if (/already attached/i.test(details)) {
    return { success: false, message: "Close DevTools for this tab and try again." };
  }
  return { success: false, message: "This page can't be captured. Open a regular webpage and try again." };
}

function isPreparedPage(value: unknown): value is PreparedPage {
  return typeof value === "object" && value !== null
    && "title" in value && typeof value.title === "string"
    && "width" in value && typeof value.width === "number";
}

function isRect(value: unknown): value is PageRect {
  return typeof value === "object" && value !== null && ["x", "y", "width", "height"].every((key) => typeof (value as Record<string, unknown>)[key] === "number")
    && (value as PageRect).width > 0 && (value as PageRect).height > 0;
}

function browserApi(browser?: PDFBrowserApi): PDFBrowserApi {
  return browser ?? (chrome as unknown as PDFBrowserApi);
}

type Send = (method: string, params?: object) => Promise<unknown>;

/** A failed capture whose message can be shown to the user as is. */
export class CaptureError extends Error {}

/** Attaches the debugger, runs `work`, and always detaches. */
export async function withDebugger<T>(tabId: number, work: (send: Send) => Promise<T>, browser?: PDFBrowserApi): Promise<T> {
  const api = browserApi(browser);
  const target = { tabId };
  try {
    await api.debugger.attach(target, "1.3");
  } catch (error) {
    throw new CaptureError(attachFailure(error).message);
  }
  try {
    return await work((method, params) => api.debugger.sendCommand(target, method, params));
  } finally {
    await api.debugger.detach(target).catch(() => undefined);
  }
}

async function evaluate(send: Send, expression: string, awaitPromise = false): Promise<unknown> {
  const evaluation = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true }) as
    { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;
  if (evaluation?.exceptionDetails) throw new Error("The page could not be prepared for capture.");
  return evaluation?.result?.value;
}

/** Runs the page preparation, then `work`, then always undoes the preparation. */
async function prepared<T>(send: Send, work: (page: PreparedPage) => Promise<T>): Promise<T> {
  try {
    const page = await evaluate(send, PREPARE_PAGE_SCRIPT, true);
    if (!isPreparedPage(page)) throw new Error("The page could not be prepared for capture.");
    return await work(page);
  } finally {
    await send("Runtime.evaluate", { expression: RESTORE_PAGE_SCRIPT }).catch(() => undefined);
  }
}

async function pageUrl(send: Send): Promise<string> {
  const url = await evaluate(send, "location.href").catch(() => "");
  return typeof url === "string" ? url : "";
}

/** Renders the tab as a PDF with screen styles. Returns base64 data. */
export async function capturePDF(tabId: number, options: PDFCaptureOptions = {}): Promise<CapturedFile> {
  return withDebugger(tabId, async (send) => {
    const url = options.headerFooter ? await pageUrl(send) : "";
    return prepared(send, async (page) => {
      try {
        await send("Emulation.setEmulatedMedia", { media: "screen" });
        const margin = options.headerFooter ? HEADER_MARGIN_IN : MARGIN_IN;
        const printed = await send("Page.printToPDF", {
          printBackground: true,
          paperWidth: PAPER_WIDTH_IN,
          paperHeight: PAPER_HEIGHT_IN,
          marginTop: margin,
          marginBottom: margin,
          marginLeft: MARGIN_IN,
          marginRight: MARGIN_IN,
          scale: pdfScale(page.width),
          generateDocumentOutline: true,
          ...(options.headerFooter ? { displayHeaderFooter: true, ...headerFooterTemplates(url, options.qrCode ?? false) } : {})
        }) as { data?: unknown } | undefined;
        if (typeof printed?.data !== "string" || printed.data.length === 0) {
          throw new Error("The browser returned an empty PDF.");
        }
        return { data: printed.data, title: page.title, url };
      } finally {
        await send("Emulation.setEmulatedMedia", { media: "" }).catch(() => undefined);
      }
    });
  }, options.browser);
}

/**
 * Takes a PNG of part of the page: a rectangle in page coordinates, or the prepared selection
 * when no rectangle is given. Returns base64 data and the scale used.
 */
export async function captureImage(tabId: number, options: { rect?: PageRect; scale?: number; browser?: PDFBrowserApi } = {}): Promise<CapturedFile & { scale: number; rect: PageRect }> {
  return withDebugger(tabId, async (send) => {
    const url = await pageUrl(send);
    const shoot = async (rect: PageRect, title: string): Promise<CapturedFile & { scale: number; rect: PageRect }> => {
      const scale = imageScale(rect, options.scale ?? 2);
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale }
      }) as { data?: unknown } | undefined;
      if (typeof shot?.data !== "string" || !shot.data) throw new Error("The browser returned an empty image.");
      return { data: shot.data, title, url, scale, rect };
    };
    if (options.rect) {
      const title = await evaluate(send, "document.title").catch(() => "");
      return shoot(options.rect, typeof title === "string" ? title : "");
    }
    return prepared(send, async (page) => {
      const rect = await evaluate(send, TARGET_RECT_SCRIPT);
      if (!isRect(rect)) throw new Error("The selection is no longer on the page.");
      return shoot(rect, page.title);
    });
  }, options.browser);
}

/** Takes a PNG of what is visible in the tab. */
export async function captureViewport(tabId: number, browser?: PDFBrowserApi): Promise<CapturedFile & { scale: number }> {
  return withDebugger(tabId, async (send) => {
    const url = await pageUrl(send);
    const title = await evaluate(send, "document.title").catch(() => "");
    const shot = await send("Page.captureScreenshot", { format: "png" }) as { data?: unknown } | undefined;
    if (typeof shot?.data !== "string" || !shot.data) throw new Error("The browser returned an empty image.");
    const ratio = await evaluate(send, "window.devicePixelRatio").catch(() => 1);
    return { data: shot.data, title: typeof title === "string" ? title : "", url, scale: typeof ratio === "number" ? ratio : 1 };
  }, browser);
}

/** Saves the page with its resources as an MHTML archive that opens offline. */
export async function captureArchive(tabId: number, browser?: PDFBrowserApi): Promise<CapturedFile> {
  return withDebugger(tabId, async (send) => {
    const url = await pageUrl(send);
    const title = await evaluate(send, "document.title").catch(() => "");
    const snapshot = await send("Page.captureSnapshot", { format: "mhtml" }) as { data?: unknown } | undefined;
    if (typeof snapshot?.data !== "string" || !snapshot.data) throw new Error("The browser returned an empty archive.");
    return { data: snapshot.data, title: typeof title === "string" ? title : "", url };
  }, browser);
}

export interface PageImage {
  url: string;
  mimeType: string;
  base64: string;
}

interface FrameTree {
  frame: { id: string };
  resources?: Array<{ url: string; type: string; mimeType: string }>;
  childFrames?: FrameTree[];
}

/** Addresses of the images the page shows, including the source chosen from srcset. */
export const IMAGE_SOURCES_SCRIPT = `[...new Set([...document.images].map((image) => image.currentSrc || image.src).filter((src) => src && !src.startsWith("blob:")))]`;

/** The image type from a file's first bytes, or "" when it is not a known image. */
export function sniffImageType(base64: string): string {
  const head = atob(base64.slice(0, 24));
  const bytes = Array.from(head, (char) => char.charCodeAt(0));
  if (bytes[0] === 0x89 && head.slice(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (head.startsWith("GIF8")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  if (head.slice(4, 12) === "ftypavif") return "image/avif";
  if (/^\s*(<\?xml|<svg)/i.test(head)) return "image/svg+xml";
  return "";
}

/**
 * Reads a file the page loaded: from the browser's cache when it is still there, otherwise
 * through the browser's network stack with the page's cookies (not limited by CORS).
 */
async function readResource(send: Send, frameId: string, url: string): Promise<string | undefined> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const data = url.slice(comma + 1);
    return url.slice(0, comma).endsWith(";base64") ? data : btoa(unescape(encodeURIComponent(decodeURIComponent(data))));
  }
  try {
    const content = await send("Page.getResourceContent", { frameId, url }) as { content: string; base64Encoded: boolean };
    return content.base64Encoded ? content.content : btoa(unescape(encodeURIComponent(content.content)));
  } catch {
    // Not in the cache any more.
  }
  try {
    const { resource } = await send("Network.loadNetworkResource", {
      frameId, url, options: { disableCache: false, includeCredentials: true }
    }) as { resource: { success: boolean; stream?: string } };
    if (!resource.success || !resource.stream) return undefined;
    let binary = "";
    for (;;) {
      const chunk = await send("IO.read", { handle: resource.stream, size: 1024 * 1024 }) as { data: string; base64Encoded?: boolean; eof: boolean };
      binary += chunk.base64Encoded ? atob(chunk.data) : chunk.data;
      if (chunk.eof) break;
    }
    await send("IO.close", { handle: resource.stream }).catch(() => undefined);
    return btoa(binary);
  } catch {
    return undefined;
  }
}

const MAX_PAGE_IMAGES = 300;
const MAX_PAGE_IMAGE_BYTES = 150 * 1024 * 1024;

/**
 * Reads the image files the page loaded from the browser's cache, so images from other
 * sites are included without downloading them again.
 */
export async function capturePageImages(tabId: number, browser?: PDFBrowserApi): Promise<{ title: string; url: string; images: PageImage[] }> {
  return withDebugger(tabId, async (send) => {
    const url = await pageUrl(send);
    const title = await evaluate(send, "document.title").catch(() => "");
    await send("Page.enable");
    const { frameTree } = await send("Page.getResourceTree") as { frameTree: FrameTree };
    const resources: Array<{ frameId: string; url: string; mimeType: string }> = [];
    const walk = (tree: FrameTree): void => {
      for (const resource of tree.resources ?? []) {
        // Images fetched again by scripts can be listed under another type; the MIME type decides.
        if (resource.type === "Image" || resource.mimeType.startsWith("image/")) resources.push({ frameId: tree.frame.id, url: resource.url, mimeType: resource.mimeType });
      }
      tree.childFrames?.forEach(walk);
    };
    walk(frameTree);

    // Images shown on the page that the cache no longer lists are loaded again below.
    const shown = await evaluate(send, IMAGE_SOURCES_SCRIPT).catch(() => []);
    const listed = new Set(resources.map((resource) => resource.url));
    for (const source of Array.isArray(shown) ? shown : []) {
      if (typeof source === "string" && !listed.has(source)) {
        resources.push({ frameId: frameTree.frame.id, url: source, mimeType: "" });
        listed.add(source);
      }
    }

    const images: PageImage[] = [];
    let total = 0;
    for (const resource of resources.slice(0, MAX_PAGE_IMAGES)) {
      const base64 = await readResource(send, resource.frameId, resource.url);
      if (!base64) continue;
      total += base64.length * 0.75;
      if (total > MAX_PAGE_IMAGE_BYTES) break;
      const mimeType = resource.mimeType.startsWith("image/") ? resource.mimeType : sniffImageType(base64);
      if (mimeType) images.push({ url: resource.url, mimeType, base64 });
    }
    return { title: typeof title === "string" ? title : "", url, images };
  }, browser);
}

/** Starts a download of base64 data. Returns an error result if the browser refuses. */
export async function downloadData(base64: string, mimeType: string, fileName: string, browser?: PDFBrowserApi): Promise<ExportResult> {
  try {
    await browserApi(browser).downloads.download({ url: `data:${mimeType};base64,${base64}`, filename: fileName });
    return { success: true, message: "Download started." };
  } catch {
    return { success: false, message: "The file was created but the download could not start." };
  }
}

export class PagePDFService {
  /** Captures the tab as a PDF and downloads it. */
  static async savePageAsPDF(tabId: number, options: PDFCaptureOptions = {}): Promise<ExportResult> {
    let captured: CapturedFile;
    try {
      captured = await capturePDF(tabId, options);
    } catch (error) {
      if (error instanceof CaptureError) return { success: false, message: error.message };
      const details = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message: `PDF capture failed: ${details}` };
    }
    const downloaded = await downloadData(captured.data, "application/pdf", pdfFileName(options.fileName?.trim() || captured.title), options.browser);
    if (!downloaded.success) return { success: false, message: "The PDF was created but the download could not start." };
    return { success: true, message: "PDF download started." };
  }
}
