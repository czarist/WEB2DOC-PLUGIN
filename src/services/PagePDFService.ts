import type { ExportResult } from "../types/ExportResult";

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

// A4 with 0.4 in margins. The page is laid out at its on-screen width and scaled to fit.
const PAPER_WIDTH_IN = 8.27;
const PAPER_HEIGHT_IN = 11.69;
const MARGIN_IN = 0.4;
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
      restore.push([element, element.style.getPropertyValue("position"), element.style.getPropertyPriority("position")]);
      element.style.setProperty("position", position === "fixed" ? "absolute" : "relative", "important");
    }
  }
  window.__web2docRestore = () => {
    for (const [element, value, priority] of restore) element.style.setProperty("position", value, priority);
    delete window.__web2docRestore;
  };

  return { title: document.title, width: document.documentElement.clientWidth || window.innerWidth };
})()`;

export const RESTORE_PAGE_SCRIPT = "window.__web2docRestore && window.__web2docRestore()";

/** Turns a page title into a safe file name. */
export function pdfFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
  return `${cleaned || "page"}.pdf`;
}

/** Scale that fits the on-screen layout width into the printable page width. */
export function pdfScale(layoutWidth: number): number {
  const printable = (PAPER_WIDTH_IN - 2 * MARGIN_IN) * CSS_PX_PER_IN;
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return 1;
  return Math.min(1, Math.max(0.1, Math.round((printable / layoutWidth) * 1000) / 1000));
}

function isPreparedPage(value: unknown): value is PreparedPage {
  return typeof value === "object" && value !== null
    && "title" in value && typeof value.title === "string"
    && "width" in value && typeof value.width === "number";
}

function attachFailure(error: unknown): ExportResult {
  const details = error instanceof Error ? error.message : String(error);
  if (/already attached/i.test(details)) {
    return { success: false, message: "Close DevTools for this tab and try again." };
  }
  return { success: false, message: "This page can't be captured. Open a regular webpage and try again." };
}

export class PagePDFService {
  static async savePageAsPDF(tabId: number, browser: PDFBrowserApi = chrome as unknown as PDFBrowserApi): Promise<ExportResult> {
    const target = { tabId };
    try {
      await browser.debugger.attach(target, "1.3");
    } catch (error) {
      return attachFailure(error);
    }

    let pdfData: string;
    let title: string;
    try {
      const evaluation = await browser.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: PREPARE_PAGE_SCRIPT,
        awaitPromise: true,
        returnByValue: true
      }) as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;
      const prepared = evaluation?.result?.value;
      if (evaluation?.exceptionDetails || !isPreparedPage(prepared)) {
        throw new Error("The page could not be prepared for capture.");
      }
      title = prepared.title;

      await browser.debugger.sendCommand(target, "Emulation.setEmulatedMedia", { media: "screen" });
      const printed = await browser.debugger.sendCommand(target, "Page.printToPDF", {
        printBackground: true,
        paperWidth: PAPER_WIDTH_IN,
        paperHeight: PAPER_HEIGHT_IN,
        marginTop: MARGIN_IN,
        marginBottom: MARGIN_IN,
        marginLeft: MARGIN_IN,
        marginRight: MARGIN_IN,
        scale: pdfScale(prepared.width),
        generateDocumentOutline: true
      }) as { data?: unknown } | undefined;
      if (typeof printed?.data !== "string" || printed.data.length === 0) {
        throw new Error("The browser returned an empty PDF.");
      }
      pdfData = printed.data;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message: `PDF capture failed: ${details}` };
    } finally {
      await browser.debugger.sendCommand(target, "Emulation.setEmulatedMedia", { media: "" }).catch(() => undefined);
      await browser.debugger.sendCommand(target, "Runtime.evaluate", { expression: RESTORE_PAGE_SCRIPT }).catch(() => undefined);
      await browser.debugger.detach(target).catch(() => undefined);
    }

    try {
      await browser.downloads.download({ url: `data:application/pdf;base64,${pdfData}`, filename: pdfFileName(title) });
    } catch {
      return { success: false, message: "The PDF was created but the download could not start." };
    }
    return { success: true, message: "PDF download started." };
  }
}
