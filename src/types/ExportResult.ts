export type ExportAction = "exportCSV" | "exportPDF";

export type ExportResult =
  | { success: true; message: string }
  | { success: false; message: string };

export function isExportResult(value: unknown): value is ExportResult {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "success" in value && typeof value.success === "boolean"
    && "message" in value && typeof value.message === "string";
}
