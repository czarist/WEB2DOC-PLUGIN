// Builds export files inside the page: tables (CSV, XLSX), documents (Markdown, JSON, DOCX)
// and the link and metadata inventory. Files are either downloaded from the page or handed
// back as base64 for batch exports.

import { buildDocument, findMainContent, type ExtractOptions } from "../document/extract";
import { documentText, type Inline, type PageDocument } from "../document/model";
import { interpretCell, type CellValue } from "../formats/cellValues";
import { createDocx, type DocxImage } from "../formats/docx";
import { renderJson, renderMarkdown } from "../formats/markdown";
import { createXlsx, sheetNames, type Sheet } from "../formats/xlsx";
import { bytesToBase64, downloadBlob, fileName, mimeType, type FileKind } from "../shared/files";
import { isExportResult, type DocumentFormat, type ExportResult, type FileResult, type TableFormat } from "../shared/messages";
import { addHistory } from "../shared/settings";
import type { PageSelection } from "../selection/PageSelection";
import { formatTablesAsCSV } from "../tables/CSVFormatter";
import { cellText, findTables, readTable, type FoundTable } from "../tables/TableService";

export interface BuiltFile {
  name: string;
  kind: FileKind;
  data: Uint8Array | string;
  /** What the file contains, for the status message. */
  summary: string;
}

const PAGE_CHROME_SELECTOR = "nav, header, footer, aside, form, [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary'], [role='search']";

function pageTitle(): string {
  return document.title.trim() || location.hostname || "Page";
}

function pageLanguage(): string {
  return document.documentElement.lang || "";
}

/** Not rendered: hidden with CSS or the hidden attribute. */
export function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true;
  const style = getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
}

export function hasHeaderRow(table: HTMLTableElement): boolean {
  const first = table.rows[0];
  if (!first) return false;
  if (first.parentElement?.tagName === "THEAD") return true;
  const cells = Array.from(first.cells);
  return cells.length > 0 && cells.every((cell) => cell.tagName === "TH");
}

export function tableTitle(found: FoundTable, index: number): string {
  return cellText(found.table.caption) || found.table.getAttribute("aria-label")?.trim() || found.heading || `Table ${index + 1}`;
}

/** Spreadsheet rows for a table; the header row always stays text. */
export function tableRows(table: HTMLTableElement, lang: string, convert: boolean): CellValue[][] {
  const header = hasHeaderRow(table);
  return readTable(table).map((row, r) => row.map((text) => interpretCell(text, { lang }, convert && !(header && r === 0))));
}

export function buildTableFile(tables: readonly FoundTable[], format: TableFormat, options: { convertValues: boolean; pattern: string }): BuiltFile {
  const title = pageTitle();
  const summary = tables.length === 1 ? "1 table" : `${tables.length} tables`;
  if (format === "csv") {
    return {
      name: fileName(options.pattern, { title, url: location.href, label: "tables" }, "csv"),
      kind: "csv",
      data: formatTablesAsCSV(tables.map(({ table }) => readTable(table))),
      summary
    };
  }
  const names = sheetNames(tables.map(tableTitle));
  const sheets: Sheet[] = tables.map((found, i) => ({
    name: names[i] ?? `Table ${i + 1}`,
    rows: tableRows(found.table, pageLanguage(), options.convertValues),
    header: hasHeaderRow(found.table)
  }));
  return {
    name: fileName(options.pattern, { title, url: location.href, label: "tables" }, "xlsx"),
    kind: "xlsx",
    data: createXlsx(sheets, { title, source: location.href }),
    summary
  };
}

/** The page's main content, or the whole page, as a document. */
export function pageDocument(scope: "main" | "page", extra: Partial<ExtractOptions> = {}): PageDocument {
  const root = scope === "main" ? findMainContent(document) : document.body ?? document.documentElement;
  return buildDocument(root, { title: pageTitle(), url: location.href, language: pageLanguage() }, {
    baseUrl: document.baseURI,
    skip: isHidden,
    dropPageChrome: scope === "main",
    ...extra
  });
}

/** Extraction options that apply the user's choices in the selection tools. */
export function selectionExtractOptions(selection: PageSelection): ExtractOptions {
  const ordered = new Map<Element, ChildNode[]>();
  const target = selection.target;
  if (target && selection.reordered) {
    const children = selection.orderedChildren();
    const nodes = Array.from(target.childNodes);
    // Element children follow the user's order; text between them keeps its place.
    let next = 0;
    ordered.set(target, nodes.map((node) => (node.nodeType === 1 ? children[next++] ?? node : node)));
  }
  return {
    baseUrl: document.baseURI,
    skip: (element) => selection.isExcluded(element) || isHidden(element),
    redacted: (element) => selection.has(element, "redact"),
    highlighted: (element) => selection.has(element, "highlight"),
    pageBreakBefore: (element) => selection.has(element, "break"),
    comment: (element) => selection.comments.get(element),
    childNodes: (element) => ordered.get(element) ?? Array.from(element.childNodes)
  };
}

export function selectionDocument(selection: PageSelection, title: string): PageDocument {
  const target = selection.target;
  if (!target) throw new Error("Nothing is selected.");
  return buildDocument(target, { title: title || pageTitle(), url: location.href, language: pageLanguage() }, selectionExtractOptions(selection));
}

function collectImages(document: PageDocument): string[] {
  const sources = new Set<string>();
  const visit = (inlines: readonly Inline[]): void => {
    for (const inline of inlines) {
      if (inline.type === "image") sources.add(inline.src);
      else if (inline.type === "link") visit(inline.children);
    }
  };
  const walk = (blocks: PageDocument["blocks"]): void => {
    for (const block of blocks) {
      if (block.type === "heading" || block.type === "paragraph") visit(block.content);
      else if (block.type === "list") block.items.forEach(walk);
      else if (block.type === "quote") walk(block.blocks);
      else if (block.type === "table") block.rows.forEach((row) => row.forEach((cell) => visit(cell.content)));
    }
  };
  walk(document.blocks);
  return [...sources];
}

const MAX_IMAGES = 60;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

async function loadImage(src: string): Promise<DocxImage | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(src, { signal: controller.signal, credentials: "include" });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    let type: DocxImage["type"] | undefined = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpeg" : blob.type === "image/gif" ? "gif" : undefined;
    let data: Uint8Array;
    if (type) {
      data = new Uint8Array(await blob.arrayBuffer());
      bitmap.close();
    } else {
      // WebP, AVIF, SVG and other formats are converted to PNG, which Word always supports.
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      data = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      type = "png";
    }
    return { data, type, width, height };
  } catch {
    return undefined; // blocked by the image host (CORS) or not an image; the DOCX links to it instead
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads the document's images so they can be embedded; images that fail become links. */
export async function loadDocumentImages(document: PageDocument): Promise<Map<string, DocxImage>> {
  const images = new Map<string, DocxImage>();
  let total = 0;
  for (const src of collectImages(document).slice(0, MAX_IMAGES)) {
    const image = await loadImage(src);
    if (!image || total + image.data.length > MAX_IMAGE_BYTES) continue;
    total += image.data.length;
    images.set(src, image);
  }
  return images;
}

export async function buildDocumentFile(document: PageDocument, format: DocumentFormat, name: string): Promise<BuiltFile> {
  const summary = document.title;
  if (format === "markdown") return { name, kind: "markdown", data: renderMarkdown(document), summary };
  if (format === "json") return { name, kind: "json", data: renderJson(document), summary };
  const images = await loadDocumentImages(document);
  return { name, kind: "docx", data: createDocx(document, images), summary };
}

/** Links and page metadata as a workbook with two sheets. */
export function buildInventoryFile(pattern: string): BuiltFile {
  const text = (value: string): CellValue => ({ kind: "text", text: value });
  const here = location.hostname;
  const links: CellValue[][] = [["Text", "Address", "Type", "Rel", "Opens in"].map(text)];
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = link.href;
    if (!href || href.startsWith("javascript:")) continue;
    let type = "Other";
    try {
      const url = new URL(href);
      type = url.protocol === "mailto:" ? "Email" : url.protocol === "tel:" ? "Phone" : url.hostname === here ? (url.hash && url.pathname === location.pathname ? "Same page" : "Internal") : "External";
    } catch {
      type = "Invalid";
    }
    links.push([cellText(link) || link.getAttribute("aria-label") || link.title || "", href, type, link.rel, link.target || ""].map(text));
  }

  const meta = (selector: string, attribute = "content"): string => document.querySelector(selector)?.getAttribute(attribute)?.trim() ?? "";
  const rows: Array<[string, string]> = [
    ["Title", document.title],
    ["Address", location.href],
    ["Canonical address", meta("link[rel='canonical']", "href")],
    ["Language", pageLanguage()],
    ["Description", meta("meta[name='description']")],
    ["Keywords", meta("meta[name='keywords']")],
    ["Author", meta("meta[name='author']")],
    ["Robots", meta("meta[name='robots']")],
    ["Captured", new Date().toISOString()],
    ["Links", String(links.length - 1)],
    ["Images", String(document.images.length)],
    ["Words in main content", String(documentText(pageDocument("main").blocks).split(/\s+/).filter(Boolean).length)]
  ];
  for (const tag of Array.from(document.querySelectorAll("meta[property^='og:'], meta[name^='twitter:'], meta[property^='article:']"))) {
    rows.push([tag.getAttribute("property") ?? tag.getAttribute("name") ?? "", tag.getAttribute("content") ?? ""]);
  }
  for (const heading of Array.from(document.querySelectorAll("h1, h2, h3")).filter((element) => !isHidden(element))) {
    rows.push([`Heading (${heading.tagName.toLowerCase()})`, cellText(heading)]);
  }
  const metadata: CellValue[][] = [[text("Field"), text("Value")], ...rows.filter(([, value]) => value !== "").map(([field, value]) => [text(field), text(value)])];

  return {
    name: fileName(pattern, { title: pageTitle(), url: location.href, label: "links and metadata" }, "xlsx"),
    kind: "xlsx",
    data: createXlsx([{ name: "Links", rows: links, header: true }, { name: "Metadata", rows: metadata, header: true }], { title: document.title, source: location.href }),
    summary: `${links.length - 1} links`
  };
}

function toBlob(file: BuiltFile): Blob {
  const data = typeof file.data === "string" ? file.data : file.data.slice().buffer;
  // CSV keeps its byte order mark so spreadsheet applications read UTF-8 correctly.
  return new Blob([data], { type: mimeType(file.kind) });
}

const LABELS: Partial<Record<FileKind, string>> = { csv: "CSV", xlsx: "Excel", markdown: "Markdown", json: "JSON", docx: "Word" };

/** Downloads a file from the page and records it in the local history. */
/**
 * Saves through the background service worker, which is not limited by the browser's
 * protection against repeated downloads from one page; falls back to a page download.
 */
async function saveFile(file: BuiltFile): Promise<void> {
  const built = await toFileResult(file);
  try {
    const response: unknown = await chrome.runtime.sendMessage({ action: "downloadFile", fileName: file.name, mimeType: mimeType(file.kind), base64: built.success ? built.base64 : "" });
    if (isExportResult(response) && response.success) return;
  } catch {
    // The extension was reloaded or the service worker is unavailable.
  }
  downloadBlob(toBlob(file), file.name);
}

export async function deliver(file: BuiltFile): Promise<ExportResult> {
  const label = LABELS[file.kind] ?? file.kind.toUpperCase();
  let result: ExportResult;
  try {
    await saveFile(file);
    result = { success: true, message: file.kind === "csv" || file.kind === "xlsx" ? `${label} download started for ${file.summary}.` : `${label} download started.` };
  } catch (error) {
    result = { success: false, message: `The download could not start: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
  await addHistory({ title: pageTitle(), url: location.href, format: file.kind, fileName: file.name, success: result.success, message: result.message }).catch(() => undefined);
  return result;
}

export async function toFileResult(file: BuiltFile): Promise<FileResult> {
  const bytes = typeof file.data === "string" ? new TextEncoder().encode(file.data) : file.data;
  return { success: true, message: `${file.name} created.`, fileName: file.name, mimeType: mimeType(file.kind), base64: bytesToBase64(bytes) };
}

/** Elements inside the main content that are page chrome; excluded from "clean article" PDFs. */
export function pageChromeInside(root: Element): Element[] {
  return Array.from(root.querySelectorAll(PAGE_CHROME_SELECTOR)).filter((element) => {
    // Only the outermost chrome element is needed; its descendants disappear with it.
    const outer = element.parentElement?.closest(PAGE_CHROME_SELECTOR);
    return !outer || !root.contains(outer);
  });
}

export { findTables };
