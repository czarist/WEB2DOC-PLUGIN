import { ExportError, batchReport, batchZip, combinePdfs, exportTab, isExportableUrl, type BatchItem } from "../background/ExportEngine";
import { base64ToBytes, downloadBlob, fileName, isoDate } from "../shared/files";
import { addHistory, getPreferences, getPresets, type Preset } from "../shared/settings";

interface TabEntry {
  id: number;
  title: string;
  url: string;
  exportable: boolean;
}

interface BatchResult {
  tab: TabEntry;
  state: "waiting" | "working" | "done" | "failed";
  message: string;
  item?: BatchItem;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Web2Doc batch page is missing #${id}.`);
  return element as T;
}

function setStatus(id: string, state: "success" | "error" | "", text: string): void {
  const status = byId(id);
  status.dataset["state"] = state;
  status.textContent = text;
}

function host(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const STATE_LABELS: Record<BatchResult["state"], string> = { waiting: "Waiting", working: "Exporting…", done: "Done", failed: "Failed" };

let presets: Preset[] = [];
let tabs: TabEntry[] = [];
let download: { blob: Blob; name: string } | undefined;

async function hasTabsPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ["tabs"] });
}

async function loadTabs(): Promise<void> {
  const self = await chrome.tabs.getCurrent();
  const all = await chrome.tabs.query({ currentWindow: true });
  tabs = all
    .filter((tab) => tab.id !== undefined && tab.id !== self?.id)
    .map((tab) => ({ id: tab.id as number, title: tab.title ?? "", url: tab.url ?? "", exportable: isExportableUrl(tab.url ?? "") }));
  const list = byId<HTMLUListElement>("tabList");
  if (tabs.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "There are no other tabs in this window.";
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...tabs.map((tab) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      label.className = "check grow compact-check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = String(tab.id);
      box.checked = tab.exportable;
      box.disabled = !tab.exportable;
      box.addEventListener("change", updateCount);
      const text = document.createElement("span");
      text.className = "grow";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = tab.title || tab.url;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = tab.exportable ? host(tab.url) : `${host(tab.url) || "Browser page"} · can’t be exported`;
      text.append(title, detail);
      label.append(box, text);
      item.append(label);
      return item;
    }));
  }
  updateCount();
}

function chosenTabs(): TabEntry[] {
  const ids = new Set(Array.from(document.querySelectorAll<HTMLInputElement>("#tabList input:checked")).map((box) => Number(box.value)));
  return tabs.filter((tab) => ids.has(tab.id));
}

function updateCount(): void {
  const count = chosenTabs().length;
  byId("selectionCount").textContent = count === 1 ? "1 tab selected" : `${count} tabs selected`;
  byId<HTMLButtonElement>("startBatch").disabled = count === 0;
}

function selectedPreset(): Preset | undefined {
  return presets.find((preset) => preset.id === byId<HTMLSelectElement>("batchPreset").value);
}

function updateOutputChoice(): void {
  const output = byId<HTMLSelectElement>("batchOutput");
  const pdf = selectedPreset()?.job.format === "pdf";
  const combined = output.querySelector<HTMLOptionElement>('option[value="pdf"]');
  if (combined) combined.disabled = !pdf;
  if (!pdf) output.value = "zip";
}

function renderResults(results: readonly BatchResult[]): void {
  byId<HTMLUListElement>("resultList").replaceChildren(...results.map((result) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.className = "grow";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = result.tab.title || result.tab.url;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = result.message || host(result.tab.url);
    detail.title = result.message;
    text.append(title, detail);
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset["state"] = result.state;
    badge.textContent = STATE_LABELS[result.state];
    item.append(text, badge);
    return item;
  }));
  const finished = results.filter((result) => result.state === "done" || result.state === "failed").length;
  const progress = byId<HTMLProgressElement>("batchProgress");
  progress.max = Math.max(1, results.length);
  progress.value = finished;
}

async function runBatch(): Promise<void> {
  const preset = selectedPreset();
  const chosen = chosenTabs();
  if (!preset || chosen.length === 0) return;
  const combine = byId<HTMLSelectElement>("batchOutput").value === "pdf" && preset.job.format === "pdf";
  const preferences = await getPreferences();

  byId("setupSection").hidden = true;
  byId("progressSection").hidden = false;
  byId<HTMLButtonElement>("downloadResult").disabled = true;
  byId("restartBatch").hidden = true;
  download = undefined;
  const results: BatchResult[] = chosen.map((tab) => ({ tab, state: "waiting", message: "" }));
  renderResults(results);
  byId("progressTitle").focus();

  for (const result of results) {
    result.state = "working";
    setStatus("progressStatus", "", `Exporting ${result.tab.title || host(result.tab.url)}…`);
    renderResults(results);
    try {
      const file = await exportTab(result.tab.id, preset.job, preferences);
      result.item = { title: result.tab.title, fileName: file.fileName, base64: file.base64, mimeType: file.mimeType };
      result.state = "done";
      result.message = file.fileName;
    } catch (error) {
      result.state = "failed";
      result.message = error instanceof ExportError ? error.message : `The export failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
    renderResults(results);
  }

  const items = results.flatMap((result) => (result.item ? [result.item] : []));
  const failed = results.length - items.length;
  const stamp = { title: `Web2Doc batch - ${preset.name}`, date: new Date() };
  if (items.length === 0) {
    setStatus("progressStatus", "error", "No tab could be exported. See the reasons above.");
  } else {
    try {
      if (combine) {
        const data = await combinePdfs(items, stamp.title);
        download = { blob: new Blob([base64ToBytes(data).slice().buffer], { type: "application/pdf" }), name: fileName(`Web2Doc batch ${isoDate(stamp.date)}`, stamp, "pdf") };
      } else {
        const report = batchReport(preset.name, results.map((result) => ({
          title: result.tab.title, url: result.tab.url, state: result.state, message: result.message, ...(result.item ? { fileName: result.item.fileName } : {})
        })));
        download = { blob: new Blob([base64ToBytes(batchZip(items, report)).slice().buffer], { type: "application/zip" }), name: fileName(`Web2Doc batch ${isoDate(stamp.date)}`, stamp, "zip") };
      }
      downloadBlob(download.blob, download.name);
      setStatus("progressStatus", failed ? "" : "success",
        failed ? `Exported ${items.length} of ${results.length} tabs. The download has the completed ones${combine ? "" : " and a report"}.` : `Exported ${items.length} ${items.length === 1 ? "tab" : "tabs"}. Download started.`);
      byId<HTMLButtonElement>("downloadResult").disabled = false;
      await addHistory({ title: stamp.title, url: "", format: combine ? "pdf" : "zip", fileName: download.name, success: true, message: `${items.length} of ${results.length} tabs exported.` }).catch(() => undefined);
    } catch (error) {
      setStatus("progressStatus", "error", `The files could not be combined: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  byId("restartBatch").hidden = false;
}

async function showSetup(): Promise<void> {
  byId("permissionSection").hidden = true;
  byId("setupSection").hidden = false;
  presets = await getPresets();
  const preferences = await getPreferences();
  const select = byId<HTMLSelectElement>("batchPreset");
  select.replaceChildren(...presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === preferences.defaultPresetId;
    return option;
  }));
  updateOutputChoice();
  await loadTabs();
}

document.addEventListener("DOMContentLoaded", () => {
  byId("grantTabs").addEventListener("click", () => {
    void chrome.permissions.request({ permissions: ["tabs"] }).then((granted) => {
      if (granted) void showSetup();
      else setStatus("permissionStatus", "error", "Without this permission the tabs cannot be listed.");
    });
  });
  byId("selectAll").addEventListener("click", () => {
    document.querySelectorAll<HTMLInputElement>("#tabList input:not(:disabled)").forEach((box) => { box.checked = true; });
    updateCount();
  });
  byId("selectNone").addEventListener("click", () => {
    document.querySelectorAll<HTMLInputElement>("#tabList input").forEach((box) => { box.checked = false; });
    updateCount();
  });
  byId("batchPreset").addEventListener("change", updateOutputChoice);
  byId("startBatch").addEventListener("click", () => { void runBatch(); });
  byId("downloadResult").addEventListener("click", () => {
    if (download) downloadBlob(download.blob, download.name);
  });
  byId("restartBatch").addEventListener("click", () => {
    byId("progressSection").hidden = true;
    void showSetup();
  });

  void hasTabsPermission().then((granted) => {
    if (granted) void showSetup();
    else byId("permissionSection").hidden = false;
  });
});
