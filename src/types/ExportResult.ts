export type ExportAction = "exportCSV" | "exportPDF";

export type ExportResult =
  | { success: true; message: string }
  | { success: false; message: string };

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

export function isExportResult(value: unknown): value is ExportResult {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "success" in value && typeof value.success === "boolean"
    && "message" in value && typeof value.message === "string";
}

export function isIndexList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0);
}

function isTableSummary(value: unknown): value is TableSummary {
  return typeof value === "object" && value !== null
    && "index" in value && Number.isInteger(value.index)
    && "title" in value && typeof value.title === "string"
    && "rows" in value && typeof value.rows === "number"
    && "columns" in value && typeof value.columns === "number"
    && "preview" in value && typeof value.preview === "string";
}

export function isTableListResult(value: unknown): value is TableListResult {
  if (!isExportResult(value)) return false;
  if (!value.success) return true;
  return "tables" in value && Array.isArray(value.tables) && value.tables.every(isTableSummary);
}

export function isTableHighlightMessage(value: unknown): value is TableHighlightMessage {
  return typeof value === "object" && value !== null
    && "selected" in value && isIndexList(value.selected)
    && "focused" in value && (value.focused === null || (Number.isInteger(value.focused) && (value.focused as number) >= 0));
}
