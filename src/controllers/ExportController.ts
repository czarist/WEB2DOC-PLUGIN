import { CSVService } from "../services/CSVService";
import { PDFService } from "../services/PDFService";
import type { ExportResult } from "../types/ExportResult";

export class ExportController {
  static handleExport(action: unknown): ExportResult {
    switch (action) {
      case "exportCSV":
        return CSVService.exportTablesToCSV();
      case "exportPDF":
        return PDFService.savePageAsPDF();
      default:
        return {
          success: false,
          message: "Unsupported export action."
        };
    }
  }
}
