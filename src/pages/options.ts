import type { ExportFormat, ExportScope } from "../shared/messages";
import {
  clearHistory,
  clearSnapshots,
  getCustomPresets,
  getHistory,
  getPreferences,
  getPresets,
  presetProblem,
  saveCustomPresets,
  savePreferences,
  type Preferences,
  type Preset
} from "../shared/settings";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF", mhtml: "Offline archive (MHTML)", markdown: "Markdown", json: "JSON", docx: "Word (DOCX)", xlsx: "Excel (XLSX)", csv: "CSV"
};
const SCOPE_LABELS: Record<ExportScope, string> = { main: "Main content", page: "Whole page", tables: "Tables" };
const FORMATS_BY_SCOPE: Record<ExportScope, ExportFormat[]> = {
  main: ["pdf", "markdown", "json", "docx"],
  page: ["pdf", "mhtml", "markdown", "json", "docx"],
  tables: ["xlsx", "csv"]
};
const COMMAND_LABELS: Record<string, string> = {
  "save-page-pdf": "Save the page as PDF",
  "save-part": "Save part of the page",
  "run-default-preset": "Run the default preset",
  _execute_action: "Open the Web2Doc popup"
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Web2Doc settings page is missing #${id}.`);
  return element as T;
}

function setStatus(id: string, state: "success" | "error" | "", text: string): void {
  const status = byId(id);
  status.dataset["state"] = state;
  status.textContent = text;
}

let preferences: Preferences;

async function updatePreferences(change: Partial<Preferences>): Promise<void> {
  preferences = { ...preferences, ...change };
  try {
    await savePreferences(preferences);
    setStatus("preferencesStatus", "success", "Saved.");
  } catch {
    setStatus("preferencesStatus", "error", "The settings could not be saved.");
  }
}

function presetDescription(preset: Preset): string {
  const convert = preset.job.format === "xlsx" && preset.job.convertValues ? ", values converted" : "";
  return `${SCOPE_LABELS[preset.job.scope]} · ${FORMAT_LABELS[preset.job.format]}${convert}`;
}

async function renderPresets(): Promise<void> {
  const presets = await getPresets();
  const list = byId<HTMLUListElement>("presetList");
  list.replaceChildren(...presets.map((preset) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.className = "grow";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = preset.name;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = presetDescription(preset);
    text.append(title, detail);
    item.append(text);
    if (preset.builtIn) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Built in";
      item.append(badge);
    } else {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete preset ${preset.name}`);
      remove.addEventListener("click", () => { void deletePreset(preset.id); });
      item.append(remove);
    }
    return item;
  }));

  const select = byId<HTMLSelectElement>("defaultPreset");
  select.replaceChildren(...presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === preferences.defaultPresetId;
    return option;
  }));
}

async function deletePreset(id: string): Promise<void> {
  const custom = await getCustomPresets();
  await saveCustomPresets(custom.filter((preset) => preset.id !== id));
  if (preferences.defaultPresetId === id) await updatePreferences({ defaultPresetId: "clean-article" });
  setStatus("presetStatus", "success", "Preset deleted.");
  await renderPresets();
}

function fillFormats(): void {
  const scope = byId<HTMLSelectElement>("presetScope").value as ExportScope;
  const select = byId<HTMLSelectElement>("presetFormat");
  const previous = select.value;
  select.replaceChildren(...FORMATS_BY_SCOPE[scope].map((format) => {
    const option = document.createElement("option");
    option.value = format;
    option.textContent = FORMAT_LABELS[format];
    option.selected = format === previous;
    return option;
  }));
  byId("presetConvertOption").hidden = select.value !== "xlsx";
}

async function addPreset(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const name = byId<HTMLInputElement>("presetName").value.trim();
  const scope = byId<HTMLSelectElement>("presetScope").value as ExportScope;
  const format = byId<HTMLSelectElement>("presetFormat").value as ExportFormat;
  const job = { scope, format, ...(format === "xlsx" ? { convertValues: byId<HTMLInputElement>("presetConvert").checked } : {}) };
  const problem = presetProblem(job);
  if (!name || problem) {
    setStatus("presetStatus", "error", problem ?? "Give the preset a name.");
    return;
  }
  const custom = await getCustomPresets();
  const id = `custom-${Date.now().toString(36)}`;
  await saveCustomPresets([...custom, { id, name, job }]);
  byId<HTMLInputElement>("presetName").value = "";
  setStatus("presetStatus", "success", `Preset “${name}” added.`);
  await renderPresets();
}

async function renderShortcuts(): Promise<void> {
  const commands = await chrome.commands.getAll().catch(() => []);
  const rows = commands.filter((command) => command.name && COMMAND_LABELS[command.name]).map((command) => {
    const row = document.createElement("tr");
    const action = document.createElement("td");
    action.textContent = COMMAND_LABELS[command.name ?? ""] ?? command.description ?? "";
    const key = document.createElement("td");
    if (command.shortcut) {
      const kbd = document.createElement("kbd");
      kbd.textContent = command.shortcut;
      key.append(kbd);
    } else {
      key.textContent = "Not set";
    }
    row.append(action, key);
    return row;
  });
  byId("shortcutList").replaceChildren(...rows);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

async function renderHistory(): Promise<void> {
  const history = await getHistory();
  const container = byId("historyTable");
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Exports you make will be listed here.";
    container.replaceChildren(empty);
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = '<thead><tr><th scope="col">When</th><th scope="col">Page</th><th scope="col">Format</th><th scope="col">Result</th></tr></thead>';
  const body = document.createElement("tbody");
  for (const entry of history) {
    const row = document.createElement("tr");
    const when = document.createElement("td");
    when.className = "numeric";
    when.textContent = dateFormat.format(new Date(entry.at));
    const page = document.createElement("td");
    if (entry.url) {
      const link = document.createElement("a");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = entry.title || entry.url;
      page.append(link);
    } else {
      page.textContent = entry.title || entry.fileName;
    }
    if (entry.fileName) {
      const file = document.createElement("div");
      file.className = "help";
      file.textContent = entry.fileName;
      page.append(file);
    }
    const format = document.createElement("td");
    format.textContent = entry.format.toUpperCase();
    const result = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset["state"] = entry.success ? "done" : "failed";
    badge.textContent = entry.success ? "Saved" : "Failed";
    badge.title = entry.message;
    result.append(badge);
    row.append(when, page, format, result);
    body.append(row);
  }
  table.append(body);
  container.replaceChildren(table);
}

document.addEventListener("DOMContentLoaded", () => {
  void (async () => {
    preferences = await getPreferences();
    const pattern = byId<HTMLInputElement>("fileNamePattern");
    const headerFooter = byId<HTMLInputElement>("pdfHeaderFooter");
    const qrCode = byId<HTMLInputElement>("pdfQrCode");
    const keepHistory = byId<HTMLInputElement>("keepHistory");
    pattern.value = preferences.fileNamePattern;
    headerFooter.checked = preferences.pdfHeaderFooter;
    qrCode.checked = preferences.pdfQrCode;
    qrCode.disabled = !preferences.pdfHeaderFooter;
    keepHistory.checked = preferences.keepHistory;

    pattern.addEventListener("change", () => { void updatePreferences({ fileNamePattern: pattern.value.trim() || "{title}" }); });
    headerFooter.addEventListener("change", () => {
      qrCode.disabled = !headerFooter.checked;
      void updatePreferences({ pdfHeaderFooter: headerFooter.checked });
    });
    qrCode.addEventListener("change", () => { void updatePreferences({ pdfQrCode: qrCode.checked }); });
    keepHistory.addEventListener("change", () => { void updatePreferences({ keepHistory: keepHistory.checked }); });
    byId<HTMLSelectElement>("defaultPreset").addEventListener("change", (event) => {
      void updatePreferences({ defaultPresetId: (event.target as HTMLSelectElement).value });
    });

    byId<HTMLSelectElement>("presetScope").addEventListener("change", fillFormats);
    byId<HTMLSelectElement>("presetFormat").addEventListener("change", fillFormats);
    byId<HTMLFormElement>("presetForm").addEventListener("submit", (event) => { void addPreset(event); });
    fillFormats();

    byId("openShortcuts").addEventListener("click", () => { void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); });
    byId("clearHistory").addEventListener("click", () => {
      void clearHistory().then(renderHistory).then(() => setStatus("historyStatus", "success", "History cleared."));
    });
    byId("clearSnapshots").addEventListener("click", () => {
      void clearSnapshots().then(() => setStatus("historyStatus", "success", "Saved comparisons cleared."));
    });

    await Promise.all([renderPresets(), renderShortcuts(), renderHistory()]);
  })();
});
