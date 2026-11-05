import type { ZipEntry } from "./zip.ts";

/** Files the built extension must contain, and nothing else. */
export const EXPECTED_FILES = ["content.js", "icon.png", "manifest.json", "popup.html", "popup.js"] as const;

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
      const manifest = JSON.parse(manifestEntry.data.toString("utf8")) as Record<string, unknown>;
      if (manifest["manifest_version"] !== 3) problems.push("manifest.json: manifest_version must be 3.");
      if (manifest["version"] !== version) {
        problems.push(`manifest.json: version ${String(manifest["version"])} does not match ${version}.`);
      }
    } catch {
      problems.push("manifest.json: invalid JSON.");
    }
  }

  for (const entry of entries) {
    if (entry.name.endsWith(".js") && entry.data.includes("sourceMappingURL")) {
      problems.push(`${entry.name}: contains a source map reference.`);
    }
  }

  return problems;
}
