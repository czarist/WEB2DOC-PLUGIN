import { formatTablesAsCSV } from "./CSVFormatter";
import type { ExportResult } from "../types/ExportResult";

export class CSVService {
  static exportTablesToCSV(
    tableElements: Iterable<HTMLTableElement> = document.querySelectorAll("table")
  ): ExportResult {
    const tables = Array.from(tableElements);

    if (tables.length === 0) {
      return {
        success: false,
        message: "No HTML tables were found on this page."
      };
    }

    const tableData = tables.map((table) =>
      Array.from(table.querySelectorAll("tr"), (row) =>
        Array.from(row.querySelectorAll("td, th"), (cell) => cell.textContent ?? "")
      )
    );
    const csvContent = formatTablesAsCSV(tableData);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    let downloadStarted = false;

    try {
      if (!document.body) {
        throw new Error("The page is not ready to start a download.");
      }

      a.href = url;
      a.download = "exported_tables.csv";
      document.body.appendChild(a);
      a.click();
      downloadStarted = true;
    } finally {
      a.remove();
      if (downloadStarted) {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        URL.revokeObjectURL(url);
      }
    }

    return {
      success: true,
      message: "CSV download started."
    };
  }
}
