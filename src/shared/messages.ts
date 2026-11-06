// Messages exchanged between the popup, extension pages, the content script and the
// background service worker. Every message crossing a context boundary is validated at
// runtime with the guards below.

export type ExportResult =
  | { success: true; message: string }
  | { success: false; message: string };

/** A file built in one context and handed to another, for example during batch export. */
export type FileResult =
  | { success: true; message: string; fileName: string; mimeType: string; base64: string }
  | { success: false; message: string };

export type TableFormat = "csv" | "xlsx";
export type DocumentFormat = "markdown" | "json" | "docx";
export type ExportFormat = "pdf" | "mhtml" | TableFormat | DocumentFormat;

/** What a preset exports: the whole page, its main content without page chrome, or its tables. */
export type ExportScope = "page" | "main" | "tables";

/** A table found on the page, as shown in the popup's table picker. */
export interface TableSummary {
  index: number;
  title: string;
  rows: number;
  columns: number;
  preview: string;
}

export type TableListResult =
  | { success: true; message: string; tables: TableSummary[] }
  | { success: false; message: string };

/** Popup-to-page port that highlights tables while the picker is open. */
export const TABLE_HIGHLIGHT_PORT = "web2doc-table-highlight";

export interface TableHighlightMessage {
  selected: number[];
  focused: number | null;
}

/** Popup-to-page request that opens the selection tools on the page. */
export const START_SELECTION_ACTION = "startSelection";

/** How an export runs: what to export and the options that shape the file. */
export interface ExportJob {
  scope: ExportScope;
  format: ExportFormat;
  /** Convert numbers, dates, and currencies in spreadsheets when the page gives enough context. */
  convertValues?: boolean;
}

/** Requests the content script accepts. */
export type ContentRequest =
  | { action: "listTables" }
  | { action: "exportTables"; format: TableFormat; tables?: number[]; convertValues?: boolean }
  | { action: "startSelection"; mode?: "element" | "area" }
  | { action: "exportDocument"; format: DocumentFormat; scope: "main" | "page" }
  | { action: "copyMarkdown"; scope: "main" | "page" }
  | { action: "exportInventory" }
  | { action: "pageText" }
  | { action: "buildFile"; job: ExportJob }
  | { action: "prepareCapture"; scope: "main" }
  | { action: "restoreCapture" };

/** Page area in CSS pixels, relative to the top-left corner of the document. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What to do with a picture of part of the page. */
export type ImageCaptureKind = "png" | "pdf" | "ocr";

/** Selection requests the content script sends for its own tab. */
export interface SelectionPDFRequest {
  action: "exportSelectionPDF";
  fileName: string;
}

export interface SelectionImageRequest {
  action: "captureSelectionImage";
  kind: ImageCaptureKind;
  fileName: string;
  /** An area drawn by the user; without it the marked selection is captured. */
  rect?: PageRect;
}

/**
 * A file built in the page and saved by the background service worker. Downloads started by
 * the page itself are limited by the browser's protection against repeated downloads.
 */
export interface DownloadRequest {
  action: "downloadFile";
  fileName: string;
  mimeType: string;
  base64: string;
}

const DOWNLOAD_TYPES = new Set([
  "text/csv;charset=utf-8",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown;charset=utf-8",
  "application/json;charset=utf-8",
  "text/plain;charset=utf-8"
]);
const MAX_DOWNLOAD_BASE64 = 200 * 1024 * 1024;

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  return isRecord(value) && value["action"] === "downloadFile"
    && typeof value["fileName"] === "string" && value["fileName"].length > 0 && value["fileName"].length <= 300
    && typeof value["mimeType"] === "string" && DOWNLOAD_TYPES.has(value["mimeType"])
    && typeof value["base64"] === "string" && value["base64"].length <= MAX_DOWNLOAD_BASE64 && /^[A-Za-z0-9+/]*={0,2}$/.test(value["base64"].slice(-4));
}

/** Requests from extension pages (popup, options, batch) that act on a tab they name. */
export type TabRequest =
  | { action: "exportPDF"; tabId: number }
  | { action: "saveArchive"; tabId: number }
  | { action: "exportImages"; tabId: number }
  | { action: "ocrVisible"; tabId: number }
  | { action: "compareCapture"; tabId: number }
  | { action: "runPreset"; tabId: number; presetId: string };

export type TabAction = TabRequest["action"];

const TAB_ACTIONS: ReadonlySet<string> = new Set<TabAction>([
  "exportPDF", "saveArchive", "exportImages", "ocrVisible", "compareCapture", "runPreset"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExportResult(value: unknown): value is ExportResult {
  return isRecord(value) && typeof value["success"] === "boolean" && typeof value["message"] === "string";
}

export function isFileResult(value: unknown): value is FileResult {
  if (!isExportResult(value)) return false;
  if (!value.success) return true;
  const record = value as unknown as Record<string, unknown>;
  return typeof record["fileName"] === "string" && typeof record["mimeType"] === "string"
    && typeof record["base64"] === "string";
}

export function isIndexList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0);
}

function isTableSummary(value: unknown): value is TableSummary {
  return isRecord(value)
    && Number.isInteger(value["index"])
    && typeof value["title"] === "string"
    && typeof value["rows"] === "number"
    && typeof value["columns"] === "number"
    && typeof value["preview"] === "string";
}

export function isTableListResult(value: unknown): value is TableListResult {
  if (!isExportResult(value)) return false;
  if (!value.success) return true;
  return "tables" in value && Array.isArray(value.tables) && value.tables.every(isTableSummary);
}

export function isTableHighlightMessage(value: unknown): value is TableHighlightMessage {
  return isRecord(value)
    && isIndexList(value["selected"])
    && (value["focused"] === null || (Number.isInteger(value["focused"]) && (value["focused"] as number) >= 0));
}

const EXPORT_FORMATS: ReadonlySet<string> = new Set<ExportFormat>(["pdf", "mhtml", "csv", "xlsx", "markdown", "json", "docx"]);
const EXPORT_SCOPES: ReadonlySet<string> = new Set<ExportScope>(["page", "main", "tables"]);

export function isExportJob(value: unknown): value is ExportJob {
  return isRecord(value)
    && typeof value["scope"] === "string" && EXPORT_SCOPES.has(value["scope"])
    && typeof value["format"] === "string" && EXPORT_FORMATS.has(value["format"])
    && (value["convertValues"] === undefined || typeof value["convertValues"] === "boolean");
}

/** Validates a request sent to the content script; returns undefined for anything else. */
export function parseContentRequest(value: unknown): ContentRequest | undefined {
  if (!isRecord(value)) return undefined;
  const scope = value["scope"] === "page" ? "page" : "main";
  switch (value["action"]) {
    case "listTables":
    case "exportInventory":
    case "pageText":
    case "restoreCapture":
      return { action: value["action"] };
    case "exportTables": {
      const format = value["format"];
      if (format !== "csv" && format !== "xlsx") return undefined;
      const tables = value["tables"];
      if (tables !== undefined && !isIndexList(tables)) return { action: "exportTables", format, tables: [] };
      return {
        action: "exportTables",
        format,
        ...(tables === undefined ? {} : { tables }),
        ...(value["convertValues"] === true ? { convertValues: true } : {})
      };
    }
    case "exportCSV": {
      // Older popups used a dedicated CSV action.
      const tables = value["tables"];
      return { action: "exportTables", format: "csv", ...(tables === undefined ? {} : { tables: isIndexList(tables) ? tables : [] }) };
    }
    case "startSelection":
      return { action: "startSelection", mode: value["mode"] === "area" ? "area" : "element" };
    case "exportDocument": {
      const format = value["format"];
      if (format !== "markdown" && format !== "json" && format !== "docx") return undefined;
      return { action: "exportDocument", format, scope };
    }
    case "copyMarkdown":
      return { action: "copyMarkdown", scope };
    case "buildFile":
      return isExportJob(value["job"]) ? { action: "buildFile", job: value["job"] } : undefined;
    case "prepareCapture":
      return { action: "prepareCapture", scope: "main" };
    default:
      return undefined;
  }
}

function isFileName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300;
}

export function isSelectionPDFRequest(value: unknown): value is SelectionPDFRequest {
  return isRecord(value) && value["action"] === "exportSelectionPDF" && isFileName(value["fileName"]);
}

export function isPageRect(value: unknown): value is PageRect {
  if (!isRecord(value)) return false;
  return ["x", "y", "width", "height"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key] as number))
    && (value["width"] as number) > 0 && (value["height"] as number) > 0;
}

export function isSelectionImageRequest(value: unknown): value is SelectionImageRequest {
  return isRecord(value) && value["action"] === "captureSelectionImage"
    && (value["kind"] === "png" || value["kind"] === "pdf" || value["kind"] === "ocr")
    && isFileName(value["fileName"])
    && (value["rect"] === undefined || isPageRect(value["rect"]));
}

export function isTabRequest(value: unknown): value is TabRequest {
  if (!isRecord(value) || typeof value["action"] !== "string" || !TAB_ACTIONS.has(value["action"])) return false;
  if (!Number.isInteger(value["tabId"])) return false;
  return value["action"] !== "runPreset" || (typeof value["presetId"] === "string" && value["presetId"].length <= 100);
}
