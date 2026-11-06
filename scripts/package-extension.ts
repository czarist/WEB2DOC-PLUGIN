// Zips the built extension in dist/ into release/web2doc-<version>.zip and verifies the archive.
// Run `npm run build` first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { archiveName, EXPECTED_FILES, verifyPackageEntries } from "./release/package.ts";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { createZip, readZip } from "../src/formats/zip.ts";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const releaseDir = path.join(root, "release");
const version = (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }).version;

function fail(problems: string[]): never {
  console.error("Packaging failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (!existsSync(dist)) fail(["dist/ does not exist. Run `npm run build` first."]);

const entries = EXPECTED_FILES.map((name) => {
  const file = path.join(dist, name);
  if (!existsSync(file)) fail([`dist/${name} is missing. Run \`npm run build\` first.`]);
  return { name, data: readFileSync(file) };
});

const archive = createZip(entries, { deflate: (data) => deflateRawSync(data, { level: 9 }) });
const readBack = readZip(archive, { inflate: (data) => inflateRawSync(data) });
const problems = verifyPackageEntries(readBack, version);
for (const original of entries) {
  const copy = readBack.find((entry) => entry.name === original.name);
  if (copy && !Buffer.from(copy.data).equals(original.data)) problems.push(`${original.name}: archived content differs from dist/.`);
}
if (problems.length > 0) fail(problems);

mkdirSync(releaseDir, { recursive: true });
const output = path.join(releaseDir, archiveName(version));
writeFileSync(output, archive);
console.log(`Created ${path.relative(root, output)} (${readBack.length} files, ${archive.length} bytes).`);
