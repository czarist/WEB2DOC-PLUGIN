import { isExportResult, type ExportAction, type ExportResult } from "../types/ExportResult";

export async function exportActiveTab(action: ExportAction): Promise<ExportResult> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return { success: false, message: "Could not find an active webpage. Select a regular webpage and try again." };
  }
  const tabId = tabs[0]?.id;
  if (tabId === undefined) {
    return { success: false, message: "Could not find an active webpage. Select a regular webpage and try again." };
  }
  try {
    const result: unknown = await chrome.tabs.sendMessage(tabId, { action });
    return isExportResult(result) ? result
      : { success: false, message: "The page returned an invalid response. Reload it and try again." };
  } catch {
    return { success: false, message: "This page can't be accessed. Open a regular webpage and try again." };
  }
}
