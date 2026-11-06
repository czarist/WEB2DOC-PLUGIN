import assert from "node:assert/strict";
import test from "node:test";
import { stubGlobal } from "./helpers.ts";
import { diffLines, diffStats, visibleLines } from "../src/shared/diff.ts";
import { base64ToBytes, bytesToBase64, cleanFileName, downloadBlob, fileName } from "../src/shared/files.ts";
import { isExportJob, isTabRequest, parseContentRequest } from "../src/shared/messages.ts";
import { sourceQrSvg } from "../src/shared/qr.ts";
import {
  BUILT_IN_PRESETS,
  DEFAULT_PREFERENCES,
  addHistory,
  findPreset,
  getHistory,
  getPreferences,
  getPresets,
  parsePreferences,
  presetProblem,
  saveCustomPresets,
  savePreferences,
  saveSnapshot,
  type StorageArea
} from "../src/shared/settings.ts";

function memoryStorage(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(data[key])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    }
  };
}

test("builds file names from patterns without unsafe characters or doubled extensions", () => {
  const date = new Date(2026, 10, 5, 9, 7);
  assert.equal(fileName("{title}", { title: "Report: Q3/2026", date }, "pdf"), "Report Q3 2026.pdf");
  assert.equal(fileName("{title} - {date}", { title: "Notes", date }, "markdown"), "Notes - 2026-11-05.md");
  assert.equal(fileName("{host} {time} {label}", { title: "x", url: "https://www.example.com/a", date, label: "tables" }, "xlsx"), "example.com 09-07 tables.xlsx");
  assert.equal(fileName("{title} - {label}", { title: "Page", date }, "csv"), "Page.csv", "an empty field leaves no dangling separator");
  assert.equal(fileName("summary.PDF", { title: "x", date }, "pdf"), "summary.pdf");
  assert.equal(fileName("", { title: "", date }, "docx"), "page.docx");
  assert.equal(cleanFileName("  ..a<b>c..  "), "a b c");
  const bytes = new Uint8Array(70_000).map((_v, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test("downloads through a temporary link and releases the object URL", (t) => {
  let created: Blob | undefined;
  const revoked: string[] = [];
  let cleanup: (() => void) | undefined;
  t.mock.method(URL, "createObjectURL", (blob: Blob) => { created = blob; return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", (url: string) => { revoked.push(url); });
  const anchor = { href: "", download: "", clicked: 0, click() { this.clicked++; }, remove() {} };
  const doc: { createElement: () => typeof anchor; body: { appendChild(): void } | null } = { createElement: () => anchor, body: { appendChild() {} } };
  stubGlobal(t, "document", doc);
  stubGlobal(t, "window", { setTimeout(callback: () => void) { cleanup = callback; } });

  downloadBlob(new Blob(["a"]), "a.txt");
  assert.equal(anchor.download, "a.txt");
  assert.equal(anchor.clicked, 1);
  assert.ok(created);
  assert.deepEqual(revoked, []);
  cleanup?.();
  assert.deepEqual(revoked, ["blob:test"]);

  doc.body = null;
  assert.throws(() => downloadBlob(new Blob(["b"]), "b.txt"), /not ready/);
  assert.deepEqual(revoked, ["blob:test", "blob:test"], "a failed download releases the URL at once");
});

test("validates messages crossing extension contexts", () => {
  assert.deepEqual(parseContentRequest({ action: "exportTables", format: "xlsx", tables: [0, 2], convertValues: true }),
    { action: "exportTables", format: "xlsx", tables: [0, 2], convertValues: true });
  assert.deepEqual(parseContentRequest({ action: "exportTables", format: "csv", tables: ["x"] }), { action: "exportTables", format: "csv", tables: [] });
  assert.deepEqual(parseContentRequest({ action: "startSelection", mode: "area" }), { action: "startSelection", mode: "area" });
  assert.deepEqual(parseContentRequest({ action: "startSelection", mode: "other" }), { action: "startSelection", mode: "element" });
  assert.deepEqual(parseContentRequest({ action: "exportDocument", format: "docx" }), { action: "exportDocument", format: "docx", scope: "main" });
  for (const value of [null, [], {}, { action: "exportPDF" }, { action: "exportTables", format: "pdf" }, { action: "exportDocument", format: "html" },
    { action: "buildFile", job: { scope: "page", format: "exe" } }]) {
    assert.equal(parseContentRequest(value), undefined, JSON.stringify(value));
  }
  assert.equal(isExportJob({ scope: "tables", format: "xlsx", convertValues: true }), true);
  assert.equal(isExportJob({ scope: "tables", format: "xlsx", convertValues: "yes" }), false);
  assert.equal(isTabRequest({ action: "runPreset", tabId: 1, presetId: "clean-article" }), true);
  assert.equal(isTabRequest({ action: "runPreset", tabId: 1 }), false);
  assert.equal(isTabRequest({ action: "deleteEverything", tabId: 1 }), false);
  assert.equal(isTabRequest({ action: "exportPDF", tabId: "1" }), false);
});

test("stores preferences, presets, history and snapshots locally and falls back on damaged values", async () => {
  const storage = memoryStorage();
  assert.deepEqual(await getPreferences(storage), DEFAULT_PREFERENCES);
  storage.data["preferences"] = { fileNamePattern: 42, pdfHeaderFooter: true, keepHistory: "no" };
  assert.deepEqual(await getPreferences(storage), { ...DEFAULT_PREFERENCES, pdfHeaderFooter: true });
  await savePreferences({ ...DEFAULT_PREFERENCES, fileNamePattern: "{title} {date}" }, storage);
  assert.equal(parsePreferences(storage.data["preferences"]).fileNamePattern, "{title} {date}");

  assert.equal(presetProblem({ scope: "tables", format: "pdf" }), "Tables export to CSV or Excel.");
  assert.equal(presetProblem({ scope: "main", format: "xlsx" }), "CSV and Excel export tables; choose the Tables scope.");
  assert.equal(presetProblem({ scope: "main", format: "mhtml" }), "Offline archives always contain the whole page.");
  for (const preset of BUILT_IN_PRESETS) assert.equal(presetProblem(preset.job), null, preset.id);
  await saveCustomPresets([
    { id: "mine", name: "My docs", job: { scope: "main", format: "docx" } },
    { id: "bad", name: "Broken", job: { scope: "tables", format: "pdf" } }
  ], storage);
  assert.deepEqual((await getPresets(storage)).map((preset) => preset.id), [...BUILT_IN_PRESETS.map((preset) => preset.id), "mine"]);
  assert.equal((await findPreset("mine", storage))?.builtIn, false);

  for (let i = 0; i < 105; i++) {
    await addHistory({ title: `Page ${i}`, url: "https://x", format: "pdf", fileName: `${i}.pdf`, success: true, message: "ok" }, storage);
  }
  const history = await getHistory(storage);
  assert.equal(history.length, 100);
  assert.equal(history[0]?.title, "Page 104", "newest first");
  await savePreferences({ ...DEFAULT_PREFERENCES, keepHistory: false }, storage);
  await addHistory({ title: "Private", url: "", format: "pdf", fileName: "", success: true, message: "" }, storage);
  assert.equal((await getHistory(storage))[0]?.title, "Page 104", "history can be turned off");

  assert.equal(await saveSnapshot({ url: "https://x/a#one", title: "A", at: "1", text: "first" }, storage), undefined);
  const previous = await saveSnapshot({ url: "https://x/a#two", title: "A", at: "2", text: "second" }, storage);
  assert.equal(previous?.text, "first", "captures of the same page are matched without the fragment");
});

test("compares captures line by line and keeps context around changes", () => {
  const before = ["intro", "a", "b", "c", "d", "e", "f", "g", "outro"];
  const after = ["intro", "a", "B", "c", "d", "e", "f", "g", "new", "outro"];
  const lines = diffLines(before, after);
  assert.deepEqual(diffStats(lines), { added: 2, removed: 1, same: 8 });
  assert.deepEqual(lines.filter((line) => line.kind !== "same"), [
    { kind: "removed", text: "b" }, { kind: "added", text: "B" }, { kind: "added", text: "new" }
  ]);
  assert.deepEqual(diffLines(["x"], ["x"]), [{ kind: "same", text: "x" }]);
  assert.deepEqual(diffLines([], ["y"]), [{ kind: "added", text: "y" }]);
  const shown = visibleLines(lines, true);
  assert.deepEqual(shown.filter((line) => line.kind === "gap"), [{ kind: "gap", count: 1 }], "two lines of context on each side of a change");
  const far = visibleLines(diffLines(Array.from({ length: 20 }, (_v, i) => `l${i}`), ["changed", ...Array.from({ length: 19 }, (_v, i) => `l${i + 1}`)]), true);
  assert.deepEqual(far.at(-1), { kind: "gap", count: 17 });
});

test("draws a QR code for the source page", () => {
  const svg = sourceQrSvg("https://example.com/página");
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  assert.match(svg, /<path d="M4 4h1v1h-1z/, "the finder pattern starts after the quiet zone");
});
