import {
  TABLE_HIGHLIGHT_PORT,
  isExportResult,
  isTableListResult,
  type ExportAction,
  type ExportResult,
  type TableListResult
} from "../types/ExportResult";

const NO_TAB: ExportResult = { success: false, message: "Could not find an active webpage. Select a regular webpage and try again." };
const INVALID_RESPONSE: ExportResult = { success: false, message: "The page returned an invalid response. Reload it and try again." };
const NO_ACCESS: ExportResult = { success: false, message: "This page can't be accessed. Open a regular webpage and try again." };

async function activeTabId(): Promise<number | undefined> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  } catch {
    return undefined;
  }
}

async function sendToTab<T extends ExportResult>(
  tabId: number,
  message: object,
  isValid: (value: unknown) => value is T
): Promise<T | ExportResult> {
  try {
    const result: unknown = await chrome.tabs.sendMessage(tabId, message);
    return isValid(result) ? result : INVALID_RESPONSE;
  } catch {
    return NO_ACCESS;
  }
}

/**
 * Runs an export for the active tab. CSV runs in the page's content script; pass `tables`
 * to export only those picker indexes. PDF capture runs in the background service worker,
 * which has the privileged APIs it needs.
 */
export async function exportActiveTab(action: ExportAction, tables?: number[]): Promise<ExportResult> {
  const tabId = await activeTabId();
  if (tabId === undefined) return NO_TAB;

  if (action === "exportPDF") {
    try {
      const result: unknown = await chrome.runtime.sendMessage({ action, tabId });
      return isExportResult(result) ? result : INVALID_RESPONSE;
    } catch {
      return { success: false, message: "Web2Doc could not start the PDF capture. Reload the extension and try again." };
    }
  }

  return sendToTab(tabId, tables === undefined ? { action } : { action, tables }, isExportResult);
}

/** Lists the active tab's tables and returns the tab they belong to. */
export async function listActiveTabTables(): Promise<{ result: TableListResult | ExportResult; tabId?: number }> {
  const tabId = await activeTabId();
  if (tabId === undefined) return { result: NO_TAB };
  const result = await sendToTab(tabId, { action: "listTables" }, isTableListResult);
  return { result, tabId };
}

/** Opens the port that highlights tables on the page while the picker is shown. */
export function connectTableHighlight(tabId: number): chrome.runtime.Port | undefined {
  try {
    return chrome.tabs.connect(tabId, { name: TABLE_HIGHLIGHT_PORT });
  } catch {
    return undefined;
  }
}
