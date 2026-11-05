import { ExportController } from "./controllers/ExportController";
import { TableHighlighter } from "./services/TableHighlighter";
import {
  TABLE_HIGHLIGHT_PORT,
  isTableHighlightMessage,
  type ExportResult,
  type TableListResult
} from "./types/ExportResult";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  let result: ExportResult | TableListResult;

  try {
    result = ExportController.handleExport(message);
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

// While the popup's table picker is open it keeps this port connected; closing the
// popup disconnects it and removes the highlights.
const highlighter = new TableHighlighter();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TABLE_HIGHLIGHT_PORT) return;
  port.onMessage.addListener((message: unknown) => {
    if (isTableHighlightMessage(message)) {
      highlighter.show(ExportController.tables, message.selected, message.focused);
    }
  });
  port.onDisconnect.addListener(() => highlighter.clear());
});
