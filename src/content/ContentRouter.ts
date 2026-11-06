// Handles requests that run inside the page. PDF, image and archive capture run in the
// background service worker, which has the debugger and downloads APIs.

import { documentText } from "../document/model";
import { renderMarkdown } from "../formats/markdown";
import { fileName } from "../shared/files";
import {
  parseContentRequest,
  type ContentRequest,
  type ExportJob,
  type ExportResult,
  type FileResult,
  type TableFormat,
  type TableListResult
} from "../shared/messages";
import { getPreferences } from "../shared/settings";
import { PageSelection, type PagePreparation } from "../selection/PageSelection";
import { findTables, summarizeTable } from "../tables/TableService";
import {
  buildDocumentFile,
  buildInventoryFile,
  buildTableFile,
  deliver,
  pageChromeInside,
  pageDocument,
  toFileResult,
  type BuiltFile
} from "./PageExporter";
import { findMainContent } from "../document/extract";

export type ContentResponse =
  | ExportResult
  | TableListResult
  | FileResult
  | { success: true; message: string; text: string; title: string; url: string };

export interface ContentHooks {
  /** Opens the selection tools on the page. */
  startSelection(mode: "element" | "area"): ExportResult;
}

// A capture prepared for the background service worker is restored after this long even if
// the "restore" request never arrives (for example when the extension is reloaded).
const CAPTURE_SAFETY_MS = 120_000;

export class ContentRouter {
  private static scanned: HTMLTableElement[] = [];
  private static capture: { preparation: PagePreparation; timer: ReturnType<typeof setTimeout> } | undefined;

  /** Tables from the latest scan, indexed as in the popup's table picker. */
  static get tables(): HTMLTableElement[] {
    return this.scanned;
  }

  static async handle(message: unknown, hooks: ContentHooks): Promise<ContentResponse> {
    const request = parseContentRequest(message);
    if (!request) return { success: false, message: "Unsupported export action." };
    return this.route(request, hooks);
  }

  private static async route(request: ContentRequest, hooks: ContentHooks): Promise<ContentResponse> {
    switch (request.action) {
      case "listTables":
        return this.listTables();
      case "exportTables": {
        const file = this.tableFile(request.format, request.tables, request.convertValues ?? false, await this.pattern());
        return "kind" in file ? deliver(file) : file;
      }
      case "startSelection":
        return hooks.startSelection(request.mode ?? "element");
      case "exportDocument": {
        const document = pageDocument(request.scope);
        const kind = request.format === "markdown" ? "markdown" : request.format;
        const name = fileName(await this.pattern(), { title: document.title, url: document.url }, kind);
        return deliver(await buildDocumentFile(document, request.format, name));
      }
      case "copyMarkdown": {
        const document = pageDocument(request.scope);
        return { success: true, message: "Markdown ready.", text: renderMarkdown(document), title: document.title, url: document.url };
      }
      case "exportInventory":
        return deliver(buildInventoryFile(await this.pattern()));
      case "pageText": {
        const document = pageDocument("main");
        return { success: true, message: "Text ready.", text: documentText(document.blocks), title: document.title, url: document.url };
      }
      case "buildFile":
        return this.buildFile(request.job, await this.pattern());
      case "prepareCapture":
        return this.prepareCapture();
      case "restoreCapture":
        this.restoreCapture();
        return { success: true, message: "The page was restored." };
    }
  }

  private static async pattern(): Promise<string> {
    try {
      return (await getPreferences()).fileNamePattern;
    } catch {
      return "{title}";
    }
  }

  private static listTables(): TableListResult {
    const found = findTables();
    this.scanned = found.map(({ table }) => table);
    if (found.length === 0) {
      return { success: false, message: "No HTML tables were found on this page." };
    }
    return {
      success: true,
      message: found.length === 1 ? "1 table found." : `${found.length} tables found.`,
      tables: found.map(summarizeTable)
    };
  }

  /** The chosen tables (or all of them) as a file, or the reason they cannot be exported. */
  private static tableFile(format: TableFormat, indices: number[] | undefined, convertValues: boolean, pattern: string): BuiltFile | ExportResult {
    const all = findTables();
    let chosen = all;
    if (indices !== undefined) {
      if (indices.length === 0) return { success: false, message: "Select at least one table." };
      const tables = indices.map((index) => this.scanned[index]);
      if (tables.some((table) => !table?.isConnected)) {
        return { success: false, message: "The page changed. Go back and choose the tables again." };
      }
      chosen = tables.map((table) => all.find((found) => found.table === table) ?? { table: table as HTMLTableElement, heading: "" });
    }
    if (chosen.length === 0) return { success: false, message: "No HTML tables were found on this page." };
    return buildTableFile(chosen, format, { convertValues, pattern });
  }

  private static async buildFile(job: ExportJob, pattern: string): Promise<FileResult> {
    try {
      if (job.format === "csv" || job.format === "xlsx") {
        const file = this.tableFile(job.format, undefined, job.convertValues ?? false, pattern);
        return "kind" in file ? toFileResult(file) : { success: false, message: file.message };
      }
      if (job.format === "markdown" || job.format === "json" || job.format === "docx") {
        const document = pageDocument(job.scope === "page" ? "page" : "main");
        const name = fileName(pattern, { title: document.title, url: document.url }, job.format);
        return toFileResult(await buildDocumentFile(document, job.format, name));
      }
      return { success: false, message: "That format is created by the background service worker." };
    } catch (error) {
      return { success: false, message: `The file could not be created: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }

  /**
   * Prepares the page so that a PDF shows only its main content ("clean article"): the
   * main element, without navigation, banners, sidebars, forms or footers inside it.
   */
  private static prepareCapture(): ExportResult {
    this.restoreCapture();
    const main = findMainContent(document);
    const selection = new PageSelection();
    if (!selection.choose(main)) return { success: false, message: "This page has no main content to capture." };
    for (const element of pageChromeInside(main)) selection.toggle("exclude", element);
    try {
      const preparation = selection.prepare(document);
      const timer = setTimeout(() => this.restoreCapture(), CAPTURE_SAFETY_MS);
      this.capture = { preparation, timer };
      return { success: true, message: "The page is ready to capture." };
    } catch (error) {
      return { success: false, message: `The page could not be prepared: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }

  private static restoreCapture(): void {
    if (!this.capture) return;
    clearTimeout(this.capture.timer);
    this.capture.preparation.restore();
    this.capture = undefined;
  }
}
