import type { TableSummary } from "../shared/messages";

export interface FoundTable {
  table: HTMLTableElement;
  heading: string;
}

const TITLE_LIMIT = 80;
const PREVIEW_LIMIT = 90;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * Text as rendered: `innerText` skips <style> and <script> contents and hidden text such
 * as sort keys, and turns <br> into a line break. Falls back to `textContent`.
 */
export function cellText(element: Element | null | undefined): string {
  const rendered = element && "innerText" in element && typeof element.innerText === "string"
    ? element.innerText
    : element?.textContent;
  return (rendered ?? "").replace(/\s+/g, " ").trim();
}

/** Reads a table's own rows and cells; rows of nested tables are not included. */
export function readTable(table: HTMLTableElement): string[][] {
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cellText(cell)));
}

/**
 * Lists the visible tables that have rows, in document order, each with the text of
 * the closest heading before it.
 */
export function findTables(root: ParentNode = document): FoundTable[] {
  const found: FoundTable[] = [];
  let heading = "";
  for (const element of root.querySelectorAll("h1, h2, h3, h4, h5, h6, table")) {
    if (element.tagName !== "TABLE") {
      heading = cellText(element);
      continue;
    }
    const table = element as HTMLTableElement;
    if (table.rows.length > 0 && table.getClientRects().length > 0) {
      found.push({ table, heading });
    }
  }
  return found;
}

export function summarizeTable({ table, heading }: FoundTable, index: number): TableSummary {
  const rows = readTable(table);
  const title = cellText(table.caption) || table.getAttribute("aria-label")?.trim() || heading || `Table ${index + 1}`;
  const firstRow = rows.find((row) => row.some((cell) => cell !== "")) ?? [];
  return {
    index,
    title: truncate(title, TITLE_LIMIT),
    rows: rows.length,
    columns: Math.max(0, ...rows.map((row) => row.length)),
    preview: truncate(firstRow.filter((cell) => cell !== "").join(" · "), PREVIEW_LIMIT)
  };
}
