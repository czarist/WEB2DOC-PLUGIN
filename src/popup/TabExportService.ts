import {
  START_SELECTION_ACTION,
  TABLE_HIGHLIGHT_PORT,
  isExportResult,
  isTableListResult,
  type DocumentFormat,
  type ExportResult,
  type TableFormat,
  type TableListResult,
  type TabRequest
} from "../shared/messages";

const NO_TAB: ExportResult = { success: false, message: "Could not find an active webpage. Select a regular webpage and try again." };
const INVALID_RESPONSE: ExportResult = { success: false, message: "The page returned an invalid response. Reload it and try again." };
const NO_ACCESS: ExportResult = { success: false, message: "This page can't be accessed. Browser pages, the extension store, and pages opened before Web2Doc was installed are not supported; reload the page or open a regular webpage and try again." };

export async function activeTabId(): Promise<number | undefined> {
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

/** Sends a request to the active tab's content script. */
export async function sendToActiveTab<T extends ExportResult>(message: object, isValid: (value: unknown) => value is T): Promise<T | ExportResult> {
  const tabId = await activeTabId();
  if (tabId === undefined) return NO_TAB;
  return sendToTab(tabId, message, isValid);
}

/** Asks the background service worker to act on the active tab. */
export async function runOnActiveTab(action: Exclude<TabRequest["action"], "runPreset">): Promise<ExportResult>;
export async function runOnActiveTab(action: "runPreset", presetId: string): Promise<ExportResult>;
export async function runOnActiveTab(action: TabRequest["action"], presetId?: string): Promise<ExportResult> {
  const tabId = await activeTabId();
  if (tabId === undefined) return NO_TAB;
  try {
    const result: unknown = await chrome.runtime.sendMessage(action === "runPreset" ? { action, tabId, presetId } : { action, tabId });
    return isExportResult(result) ? result : INVALID_RESPONSE;
  } catch {
    return { success: false, message: "Web2Doc could not start the capture. Reload the extension and try again." };
  }
}

/**
 * Runs an export for the active tab. Tables are exported by the page's content script; pass
 * `tables` to export only those picker indexes. PDF capture runs in the background service
 * worker, which has the privileged APIs it needs.
 */
export async function exportActiveTab(action: "exportCSV" | "exportPDF", tables?: number[]): Promise<ExportResult> {
  if (action === "exportPDF") return runOnActiveTab("exportPDF");
  return exportTables("csv", tables, false);
}

export async function exportTables(format: TableFormat, tables: number[] | undefined, convertValues: boolean): Promise<ExportResult> {
  return sendToActiveTab({ action: "exportTables", format, ...(tables === undefined ? {} : { tables }), ...(convertValues ? { convertValues } : {}) }, isExportResult);
}

export async function exportDocument(format: DocumentFormat): Promise<ExportResult> {
  return sendToActiveTab({ action: "exportDocument", format, scope: "main" }, isExportResult);
}

function isTextResult(value: unknown): value is ExportResult & { text?: string } {
  return isExportResult(value) && (!value.success || typeof (value as { text?: unknown }).text === "string");
}

/** The active page's main content as Markdown. */
export async function activeTabMarkdown(): Promise<ExportResult & { text?: string }> {
  return sendToActiveTab({ action: "copyMarkdown", scope: "main" }, isTextResult);
}

export async function exportInventory(): Promise<ExportResult> {
  return sendToActiveTab({ action: "exportInventory" }, isExportResult);
}

/** Opens the in-page tools for choosing part of the active tab, or an area of it. */
export async function startActiveTabSelection(mode: "element" | "area" = "element"): Promise<ExportResult> {
  return sendToActiveTab(mode === "area" ? { action: START_SELECTION_ACTION, mode } : { action: START_SELECTION_ACTION }, isExportResult);
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
