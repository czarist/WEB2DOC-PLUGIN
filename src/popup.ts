import { exportActiveTab } from "./services/TabExportService";
import type { ExportAction } from "./types/ExportResult";

document.addEventListener("DOMContentLoaded", () => {
  const csvButton = document.getElementById("exportCSV");
  const pdfButton = document.getElementById("exportPDF");
  const status = document.getElementById("exportStatus");
  if (!(csvButton instanceof HTMLButtonElement)
      || !(pdfButton instanceof HTMLButtonElement) || !status) {
    throw new Error("Web2Doc popup is missing required controls.");
  }
  const buttons = [csvButton, pdfButton];
  const statusElement = status;
  async function runExport(action: ExportAction): Promise<void> {
    buttons.forEach((button) => { button.disabled = true; });
    statusElement.textContent = "Contacting the active tab…";
    try {
      const result = await exportActiveTab(action);
      statusElement.textContent = result.message;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  csvButton.addEventListener("click", () => { void runExport("exportCSV"); });
  pdfButton.addEventListener("click", () => { void runExport("exportPDF"); });
});
