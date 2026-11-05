import { ExportController } from "./controllers/ExportController";
import type { ExportResult } from "./types/ExportResult";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  let result: ExportResult;

  try {
    const action = isRecord(message) ? message.action : undefined;
    result = ExportController.handleExport(action);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.error("Web2Doc export failed:", details);
    result = {
      success: false,
      message: `Export failed: ${details}`
    };
  }

  sendResponse(result);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
