import { getPreferences, getPresets } from "../shared/settings";
import type { ExportResult, TabRequest } from "../shared/messages";
import { defaultServices, routeBackgroundMessage } from "./BackgroundRouter";

// Handles actions that need privileged extension APIs: captures requested by the popup and
// extension pages, by the content script once the user prepared part of the page, by
// keyboard shortcuts and by the context menu. Listeners are registered at the top level so
// the service worker can wake up for any of them.

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const task = routeBackgroundMessage(message, sender, chrome.runtime.id);
  if (!task) return false;
  void task.then(sendResponse);
  return true;
});

/** Shows the outcome of a shortcut or menu action on the toolbar icon for a few seconds. */
async function showOutcome(tabId: number, result: ExportResult): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: result.success ? "#17794a" : "#b42318" });
    await chrome.action.setBadgeText({ tabId, text: result.success ? "OK" : "!" });
    await chrome.action.setTitle({ tabId, title: `Web2Doc: ${result.message}` });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
      void chrome.action.setTitle({ tabId, title: "Web2Doc" }).catch(() => undefined);
    }, 5000);
  } catch {
    // The tab was closed.
  }
}

async function runOnTab(tabId: number, request: TabRequest | { content: object }): Promise<void> {
  let result: ExportResult;
  if ("content" in request) {
    result = await chrome.tabs.sendMessage(tabId, request.content).catch(() => ({
      success: false,
      message: "This page can't be accessed. Reload it or open a regular webpage."
    })) as ExportResult;
  } else {
    result = await defaultServices.handleTab(request, await getPreferences());
  }
  // Opening the selection tools needs no badge; the tools appear on the page.
  if ("content" in request && (request.content as { action?: string }).action === "startSelection" && result.success) return;
  await showOutcome(tabId, result);
}

chrome.commands.onCommand.addListener((command, tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  if (command === "save-page-pdf") void runOnTab(tabId, { action: "exportPDF", tabId });
  if (command === "save-part") void runOnTab(tabId, { content: { action: "startSelection", mode: "element" } });
  if (command === "run-default-preset") {
    void getPreferences().then((preferences) => runOnTab(tabId, { action: "runPreset", tabId, presetId: preferences.defaultPresetId }));
  }
});

const MENU_ROOT = "web2doc";
const PRESET_PREFIX = "web2doc-preset:";

async function buildMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const contexts: ["page", "selection", "image", "link"] = ["page", "selection", "image", "link"];
  chrome.contextMenus.create({ id: MENU_ROOT, title: "Web2Doc", contexts });
  const items: Array<[string, string]> = [
    ["web2doc-pdf", "Save page as PDF"],
    ["web2doc-select", "Save part of the page…"],
    ["web2doc-area", "Save an area of the page…"],
    ["web2doc-markdown", "Save main content as Markdown"],
    ["web2doc-tables", "Export tables to Excel"]
  ];
  for (const [id, title] of items) chrome.contextMenus.create({ id, parentId: MENU_ROOT, title, contexts });
  chrome.contextMenus.create({ id: "web2doc-presets", parentId: MENU_ROOT, title: "Run preset", contexts });
  for (const preset of await getPresets()) {
    chrome.contextMenus.create({ id: `${PRESET_PREFIX}${preset.id}`, parentId: "web2doc-presets", title: preset.name, contexts });
  }
}

chrome.runtime.onInstalled.addListener(() => { void buildMenus(); });
chrome.runtime.onStartup.addListener(() => { void buildMenus(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "presets" in changes) void buildMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  const id = String(info.menuItemId);
  if (id === "web2doc-pdf") void runOnTab(tabId, { action: "exportPDF", tabId });
  else if (id === "web2doc-select") void runOnTab(tabId, { content: { action: "startSelection", mode: "element" } });
  else if (id === "web2doc-area") void runOnTab(tabId, { content: { action: "startSelection", mode: "area" } });
  else if (id === "web2doc-markdown") void runOnTab(tabId, { content: { action: "exportDocument", format: "markdown", scope: "main" } });
  else if (id === "web2doc-tables") void runOnTab(tabId, { content: { action: "exportTables", format: "xlsx", convertValues: true } });
  else if (id.startsWith(PRESET_PREFIX)) void runOnTab(tabId, { action: "runPreset", tabId, presetId: id.slice(PRESET_PREFIX.length) });
});
