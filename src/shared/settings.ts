// Preferences, presets, export history and page snapshots, kept in chrome.storage.local on
// this device only. Stored values are validated on read, so a damaged or older entry falls
// back to defaults instead of breaking an export.

import { isExportJob, type ExportJob } from "./messages";

export interface Preferences {
  /** File name pattern; see fileName() for the supported fields. */
  fileNamePattern: string;
  /** Adds the page title and address at the top of PDF pages and page numbers at the bottom. */
  pdfHeaderFooter: boolean;
  /** Adds a QR code linking to the source page in the PDF header. */
  pdfQrCode: boolean;
  /** Preset run by the keyboard shortcut and the context menu's quick action. */
  defaultPresetId: string;
  /** Keep a local list of recent exports. */
  keepHistory: boolean;
}

export interface Preset {
  id: string;
  name: string;
  job: ExportJob;
  builtIn?: boolean;
}

export interface HistoryEntry {
  at: string;
  title: string;
  url: string;
  format: string;
  fileName: string;
  success: boolean;
  message: string;
}

export interface Snapshot {
  url: string;
  title: string;
  at: string;
  text: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  fileNamePattern: "{title}",
  pdfHeaderFooter: false,
  pdfQrCode: false,
  defaultPresetId: "clean-article",
  keepHistory: true
};

export const BUILT_IN_PRESETS: readonly Preset[] = [
  { id: "clean-article", name: "Clean article (PDF)", job: { scope: "main", format: "pdf" }, builtIn: true },
  { id: "tables-only", name: "Tables only (Excel)", job: { scope: "tables", format: "xlsx", convertValues: true }, builtIn: true },
  { id: "technical-docs", name: "Technical documentation (Markdown)", job: { scope: "main", format: "markdown" }, builtIn: true },
  { id: "full-page", name: "Full page (PDF)", job: { scope: "page", format: "pdf" }, builtIn: true },
  { id: "offline-archive", name: "Offline archive (MHTML)", job: { scope: "page", format: "mhtml" }, builtIn: true }
];

const HISTORY_LIMIT = 100;
const SNAPSHOT_LIMIT = 30;
const SNAPSHOT_TEXT_LIMIT = 300_000;

/** The parts of chrome.storage.local this module uses; tests pass a map-backed double. */
export interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove?(keys: string | string[]): Promise<void>;
}

function local(area?: StorageArea): StorageArea {
  return area ?? (chrome.storage.local as unknown as StorageArea);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePreferences(value: unknown): Preferences {
  const stored = isRecord(value) ? value : {};
  const pick = <K extends keyof Preferences>(key: K, valid: (v: unknown) => boolean): Preferences[K] =>
    (valid(stored[key]) ? stored[key] : DEFAULT_PREFERENCES[key]) as Preferences[K];
  return {
    fileNamePattern: pick("fileNamePattern", (v) => typeof v === "string" && v.length <= 200),
    pdfHeaderFooter: pick("pdfHeaderFooter", (v) => typeof v === "boolean"),
    pdfQrCode: pick("pdfQrCode", (v) => typeof v === "boolean"),
    defaultPresetId: pick("defaultPresetId", (v) => typeof v === "string" && v.length <= 100),
    keepHistory: pick("keepHistory", (v) => typeof v === "boolean")
  };
}

export function isPreset(value: unknown): value is Preset {
  return isRecord(value) && typeof value["id"] === "string" && value["id"].length <= 100
    && typeof value["name"] === "string" && value["name"].trim().length > 0 && value["name"].length <= 80
    && isExportJob(value["job"]);
}

/** Checks that a preset's scope and format work together. */
export function presetProblem(job: ExportJob): string | null {
  if (job.scope === "tables" && job.format !== "csv" && job.format !== "xlsx") return "Tables export to CSV or Excel.";
  if (job.scope !== "tables" && (job.format === "csv" || job.format === "xlsx")) return "CSV and Excel export tables; choose the Tables scope.";
  if (job.format === "mhtml" && job.scope !== "page") return "Offline archives always contain the whole page.";
  return null;
}

export async function getPreferences(area?: StorageArea): Promise<Preferences> {
  const { preferences } = await local(area).get("preferences");
  return parsePreferences(preferences);
}

export async function savePreferences(preferences: Preferences, area?: StorageArea): Promise<void> {
  await local(area).set({ preferences: parsePreferences(preferences) });
}

export async function getCustomPresets(area?: StorageArea): Promise<Preset[]> {
  const { presets } = await local(area).get("presets");
  return Array.isArray(presets) ? presets.filter(isPreset).map((preset) => ({ ...preset, builtIn: false })) : [];
}

export async function getPresets(area?: StorageArea): Promise<Preset[]> {
  return [...BUILT_IN_PRESETS, ...(await getCustomPresets(area))];
}

export async function saveCustomPresets(presets: readonly Preset[], area?: StorageArea): Promise<void> {
  const valid = presets.filter((preset) => isPreset(preset) && !preset.builtIn && presetProblem(preset.job) === null);
  await local(area).set({ presets: valid.map(({ id, name, job }) => ({ id, name, job })) });
}

export async function findPreset(id: string, area?: StorageArea): Promise<Preset | undefined> {
  return (await getPresets(area)).find((preset) => preset.id === id);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  return isRecord(value) && typeof value["at"] === "string" && typeof value["title"] === "string"
    && typeof value["url"] === "string" && typeof value["format"] === "string" && typeof value["fileName"] === "string"
    && typeof value["success"] === "boolean" && typeof value["message"] === "string";
}

export async function getHistory(area?: StorageArea): Promise<HistoryEntry[]> {
  const { history } = await local(area).get("history");
  return Array.isArray(history) ? history.filter(isHistoryEntry) : [];
}

/** Adds an entry to the local export history unless the user turned history off. */
export async function addHistory(entry: Omit<HistoryEntry, "at"> & { at?: string }, area?: StorageArea): Promise<void> {
  const storage = local(area);
  const { preferences } = await storage.get("preferences");
  if (!parsePreferences(preferences).keepHistory) return;
  const history = await getHistory(storage);
  const record: HistoryEntry = { ...entry, at: entry.at ?? new Date().toISOString() };
  await storage.set({ history: [record, ...history].slice(0, HISTORY_LIMIT) });
}

export async function clearHistory(area?: StorageArea): Promise<void> {
  await local(area).set({ history: [] });
}

function isSnapshot(value: unknown): value is Snapshot {
  return isRecord(value) && typeof value["url"] === "string" && typeof value["title"] === "string"
    && typeof value["at"] === "string" && typeof value["text"] === "string";
}

export async function getSnapshots(area?: StorageArea): Promise<Snapshot[]> {
  const { snapshots } = await local(area).get("snapshots");
  return Array.isArray(snapshots) ? snapshots.filter(isSnapshot) : [];
}

/** Address used to match captures of the same page: without the fragment. */
export function pageKey(url: string): string {
  return url.replace(/#.*$/, "");
}

/** Stores a capture and returns the previous capture of the same page, if any. */
export async function saveSnapshot(snapshot: Snapshot, area?: StorageArea): Promise<Snapshot | undefined> {
  const storage = local(area);
  const snapshots = await getSnapshots(storage);
  const previous = snapshots.find((item) => pageKey(item.url) === pageKey(snapshot.url));
  const record = { ...snapshot, text: snapshot.text.slice(0, SNAPSHOT_TEXT_LIMIT) };
  await storage.set({ snapshots: [record, ...snapshots].slice(0, SNAPSHOT_LIMIT) });
  return previous;
}

export async function clearSnapshots(area?: StorageArea): Promise<void> {
  await local(area).set({ snapshots: [] });
}
