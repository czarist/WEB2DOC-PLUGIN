import type { ExportResult } from "../types/ExportResult";

export class PDFService {
  static savePageAsPDF(): ExportResult {
    window.print();
    return {
      success: true,
      message: "Print dialog opened."
    };
  }
}
