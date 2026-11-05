import { PagePDFService } from "./services/PagePDFService";
import type { ExportResult } from "./types/ExportResult";

// Handles actions that need privileged extension APIs. Only extension pages (the popup)
// may send them; content scripts and webpages are ignored.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
  if (!isPDFRequest(message)) return false;

  PagePDFService.savePageAsPDF(message.tabId)
    .catch((error: unknown): ExportResult => ({
      success: false,
      message: `PDF capture failed: ${error instanceof Error ? error.message : "Unknown error"}`
    }))
    .then(sendResponse);
  return true;
});

function isPDFRequest(value: unknown): value is { action: "exportPDF"; tabId: number } {
  return typeof value === "object" && value !== null
    && "action" in value && value.action === "exportPDF"
    && "tabId" in value && typeof value.tabId === "number";
}
