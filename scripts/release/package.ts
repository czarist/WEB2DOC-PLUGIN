import type { ZipEntry } from "../../src/formats/zip.ts";

const decoder = new TextDecoder();

/** Files the built extension must contain, and nothing else. */
export const EXPECTED_FILES = [
  "background.js",
  "batch.html",
  "batch.js",
  "compare.html",
  "compare.js",
  "content.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "manifest.json",
  "ocr.html",
  "ocr.js",
  "ocr/lang/eng.traineddata.gz",
  "ocr/lang/por.traineddata.gz",
  "ocr/tesseract-core-simd-lstm.wasm.js",
  "ocr/worker.min.js",
  "options.html",
  "options.js",
  "pages.css",
  "popup.html",
  "popup.js"
] as const;

export function archiveName(version: string): string {
  return `web2doc-${version}.zip`;
}

/** Checks that an archive holds exactly the expected extension files at the expected version. */
export function verifyPackageEntries(entries: ZipEntry[], version: string): string[] {
  const problems: string[] = [];
  const names = entries.map((entry) => entry.name).sort();
  const expected = [...EXPECTED_FILES].sort();

  for (const name of expected) {
    if (!names.includes(name)) problems.push(`Missing file: ${name}`);
  }
  for (const name of names) {
    if (!expected.includes(name as (typeof EXPECTED_FILES)[number])) problems.push(`Unexpected file: ${name}`);
  }

  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (manifestEntry) {
    try {
      const manifest = JSON.parse(decoder.decode(manifestEntry.data)) as Record<string, unknown>;
      if (manifest["manifest_version"] !== 3) problems.push("manifest.json: manifest_version must be 3.");
      if (manifest["version"] !== version) {
        problems.push(`manifest.json: version ${String(manifest["version"])} does not match ${version}.`);
      }
    } catch {
      problems.push("manifest.json: invalid JSON.");
    }
  }

  for (const entry of entries) {
    // Chromium refuses to load extension scripts that are not valid UTF-8.
    if (entry.name.endsWith(".js")) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(entry.data);
      } catch {
        problems.push(`${entry.name}: is not valid UTF-8.`);
      }
    }
    if (entry.name.endsWith(".js") && /\/\/# sourceMappingURL=/.test(decoder.decode(entry.data))) {
      problems.push(`${entry.name}: contains a source map reference.`);
    }
  }

  return problems;
}
