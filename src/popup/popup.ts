import { downloadBlob } from "../shared/files";
import type { DocumentFormat, ExportResult, TabAction } from "../shared/messages";
import { sourceQrSvg } from "../shared/qr";
import { getPreferences, getPresets } from "../shared/settings";
import { TablePicker, getTablePickerElements } from "./TablePicker";
import {
  activeTabMarkdown,
  connectTableHighlight,
  exportDocument,
  exportInventory,
  exportTables,
  listActiveTabTables,
  runOnActiveTab,
  startActiveTabSelection
} from "./TabExportService";

const BUSY_MESSAGES: Partial<Record<TabAction, string>> = {
  exportPDF: "Capturing the page…",
  saveArchive: "Saving the page and its resources…",
  exportImages: "Collecting the page's images…",
  ocrVisible: "Capturing the screen for text recognition…",
  compareCapture: "Reading the page…"
};

document.addEventListener("DOMContentLoaded", () => {
  const csvButton = document.getElementById("exportCSV");
  const pdfButton = document.getElementById("exportPDF");
  const selectButton = document.getElementById("selectPDF");
  const status = document.getElementById("exportStatus");
  if (!(csvButton instanceof HTMLButtonElement)
      || !(pdfButton instanceof HTMLButtonElement) || !(selectButton instanceof HTMLButtonElement) || !status) {
    throw new Error("Web2Doc popup is missing required controls.");
  }
  const statusElement = status;
  const buttons = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>("#mainView button"));
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
    const controls = buttons();
    controls.forEach((button) => { button.disabled = true; });
    showStatus("busy", message);
    try {
      return await task();
    } finally {
      controls.forEach((button) => { button.disabled = false; });
    }
  }

  function closeHighlight(): void {
    highlightPort?.disconnect();
    highlightPort = undefined;
  }

  function showView(id: "mainView" | "tablesView" | "qrView"): void {
    for (const view of ["mainView", "tablesView", "qrView"]) {
      const element = document.getElementById(view);
      if (element) element.hidden = view !== id;
    }
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
      onExport: async (indices, choice) => {
        showStatus("busy", choice.format === "xlsx" ? "Creating the spreadsheet…" : "Preparing the CSV…");
        showResult(await exportTables(choice.format, indices, choice.convertValues));
      },
      onClose: () => {
        closeHighlight();
        showStatus("", "");
        csvButton?.focus();
      }
    });
    picker.open(result.tables);
  }

  async function openSelection(mode: "element" | "area"): Promise<void> {
    const result = await withButtonsDisabled("Opening the selection tools…", () => startActiveTabSelection(mode));
    // The tools live on the page; close the popup so the page can be clicked right away.
    if (result.success) window.close();
    else showResult(result);
  }

  async function showQr(): Promise<void> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const url = tabs[0]?.url;
    if (!url || !/^(https?|file|ftp):/.test(url)) {
      showResult({ success: false, message: "Open a regular webpage to create its QR code." });
      return;
    }
    const svg = sourceQrSvg(url);
    const code = document.getElementById("qrCode");
    const label = document.getElementById("qrUrl");
    if (code) code.innerHTML = svg;
    if (label) label.textContent = url;
    showStatus("", "");
    showView("qrView");
    document.getElementById("qrTitle")?.focus();
    document.getElementById("downloadQr")?.addEventListener("click", () => {
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "page-qr-code.svg");
      showResult({ success: true, message: "QR code download started." });
    }, { once: true });
  }

  async function fillPresets(): Promise<void> {
    const select = document.getElementById("presetSelect");
    if (!(select instanceof HTMLSelectElement)) return;
    const [presets, preferences] = await Promise.all([getPresets(), getPreferences()]).catch(() => [[], undefined] as const);
    select.replaceChildren(...presets.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      option.selected = preset.id === preferences?.defaultPresetId;
      return option;
    }));
  }

  csvButton.addEventListener("click", () => { void openTablePicker(); });
  pdfButton.addEventListener("click", () => {
    void withButtonsDisabled(BUSY_MESSAGES.exportPDF ?? "", () => runOnActiveTab("exportPDF")).then(showResult);
  });
  selectButton.addEventListener("click", () => { void openSelection("element"); });
  document.getElementById("selectArea")?.addEventListener("click", () => { void openSelection("area"); });

  document.querySelectorAll<HTMLButtonElement>("[data-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const format = button.dataset["document"] as DocumentFormat;
      void withButtonsDisabled("Creating the file…", () => exportDocument(format)).then(showResult);
    });
  });
  document.getElementById("copyMarkdown")?.addEventListener("click", () => {
    void withButtonsDisabled("Reading the page…", activeTabMarkdown).then(async (result) => {
      if (!result.success || typeof result.text !== "string") {
        showResult(result);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.text);
        showResult({ success: true, message: "Markdown copied to the clipboard." });
      } catch {
        showResult({ success: false, message: "The browser did not allow copying. Save the Markdown file instead." });
      }
    });
  });
  document.getElementById("exportInventory")?.addEventListener("click", () => {
    void withButtonsDisabled("Listing links and metadata…", exportInventory).then(showResult);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tab-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset["tabAction"] as Exclude<TabAction, "runPreset">;
      void withButtonsDisabled(BUSY_MESSAGES[action] ?? "Working…", () => runOnActiveTab(action)).then(showResult);
    });
  });
  document.getElementById("runPreset")?.addEventListener("click", () => {
    const select = document.getElementById("presetSelect");
    if (!(select instanceof HTMLSelectElement) || !select.value) return;
    void withButtonsDisabled("Running the preset…", () => runOnActiveTab("runPreset", select.value)).then(showResult);
  });
  document.getElementById("showQr")?.addEventListener("click", () => { void showQr(); });
  document.getElementById("qrBack")?.addEventListener("click", () => {
    showView("mainView");
    document.getElementById("showQr")?.focus();
  });
  document.getElementById("openBatch")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("batch.html") }).then(() => window.close());
  });
  document.getElementById("openOptions")?.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage().then(() => window.close());
  });

  void fillPresets();
});
