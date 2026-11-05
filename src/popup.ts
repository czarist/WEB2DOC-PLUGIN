import { TablePicker, getTablePickerElements } from "./TablePicker";
import { connectTableHighlight, exportActiveTab, listActiveTabTables } from "./services/TabExportService";
import type { ExportResult } from "./types/ExportResult";

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
  let highlightPort: chrome.runtime.Port | undefined;
  let picker: TablePicker | undefined;

  function showStatus(state: "busy" | "success" | "error" | "", message: string): void {
    statusElement.dataset["state"] = state;
    statusElement.textContent = message;
  }

  function showResult(result: ExportResult): void {
    showStatus(result.success ? "success" : "error", result.message);
  }

  async function withButtonsDisabled<T>(message: string, task: () => Promise<T>): Promise<T> {
    buttons.forEach((button) => { button.disabled = true; });
    showStatus("busy", message);
    try {
      return await task();
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function closeHighlight(): void {
    highlightPort?.disconnect();
    highlightPort = undefined;
  }

  async function openTablePicker(): Promise<void> {
    const { result, tabId } = await withButtonsDisabled("Looking for tables…", listActiveTabTables);
    if (!result.success || !("tables" in result) || tabId === undefined) {
      showResult(result);
      return;
    }
    showStatus("", "");

    closeHighlight();
    highlightPort = connectTableHighlight(tabId);
    highlightPort?.onDisconnect.addListener(() => { highlightPort = undefined; });

    picker ??= new TablePicker(getTablePickerElements(), {
      highlight: (message) => {
        try {
          highlightPort?.postMessage(message);
        } catch {
          highlightPort = undefined;
        }
      },
      onExport: async (indices) => {
        showStatus("busy", "Preparing the CSV…");
        showResult(await exportActiveTab("exportCSV", indices));
      },
      onClose: () => {
        closeHighlight();
        showStatus("", "");
        csvButton?.focus();
      }
    });
    picker.open(result.tables);
  }

  csvButton.addEventListener("click", () => { void openTablePicker(); });
  pdfButton.addEventListener("click", () => {
    void withButtonsDisabled("Capturing the page…", () => exportActiveTab("exportPDF")).then(showResult);
  });
});
