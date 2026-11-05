import { CSVService } from "../services/CSVService";
import { findTables, summarizeTable } from "../services/TableService";
import { isIndexList, type ExportResult, type TableListResult } from "../types/ExportResult";

// Handles actions that run inside the page. PDF capture runs in the background service worker.
export class ExportController {
  private static scanned: HTMLTableElement[] = [];

  /** Tables from the latest scan, indexed as in the popup's table picker. */
  static get tables(): HTMLTableElement[] {
    return this.scanned;
  }

  static handleExport(message: unknown): ExportResult | TableListResult {
    const action = isRecord(message) ? message["action"] : undefined;
    switch (action) {
      case "listTables":
        return this.listTables();
      case "exportCSV":
        return this.exportCSV(isRecord(message) ? message["tables"] : undefined);
      default:
        return { success: false, message: "Unsupported export action." };
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

  private static exportCSV(indices: unknown): ExportResult {
    // Without a selection, export every table on the page.
    if (indices === undefined) {
      return CSVService.exportTablesToCSV();
    }
    if (!isIndexList(indices) || indices.length === 0) {
      return { success: false, message: "Select at least one table." };
    }
    const tables = indices.map((index) => this.scanned[index]);
    if (tables.some((table) => !table?.isConnected)) {
      return { success: false, message: "The page changed. Go back and choose the tables again." };
    }
    return CSVService.exportTablesToCSV(tables as HTMLTableElement[]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
