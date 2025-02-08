import { CSVService } from "../services/CSVService";
import { PDFService } from "../services/PDFService";

export class ExportController {
  static handleExport(action: string): void {
    if (action === "exportCSV") {
      CSVService.exportTablesToCSV();
    } else if (action === "exportPDF") {
      PDFService.savePageAsPDF();
    }
  }
}
