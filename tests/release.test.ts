import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { verifyPackageEntries } from "../scripts/release/package.ts";
import { collectVersions, findVersionProblems, readmeVersions, versionFromTag } from "../scripts/release/versions.ts";
import { createZip, readZip } from "../scripts/release/zip.ts";

const root = path.resolve(import.meta.dirname, "..");

test("repository version sources agree", () => {
  assert.deepEqual(findVersionProblems(collectVersions(root)), []);
});

test("reports mismatched, missing, and malformed versions", () => {
  const problems = findVersionProblems([
    { label: "a", version: "1.0.0" },
    { label: "b", version: "1.0.1" },
    { label: "c", version: undefined },
    { label: "d", version: "1.0" }
  ]);
  assert.deepEqual(problems, [
    "b: found 1.0.1, expected 1.0.0.",
    "c: version not found.",
    "d: \"1.0\" is not in MAJOR.MINOR.PATCH form."
  ]);
});

test("compares every source against a release tag version", () => {
  const sources = [{ label: "a", version: "1.0.1" }];
  assert.deepEqual(findVersionProblems(sources, "1.0.1"), []);
  assert.deepEqual(findVersionProblems(sources, "1.1.0"), ["a: found 1.0.1, expected 1.1.0."]);
  assert.equal(versionFromTag("v2.3.4"), "2.3.4");
  assert.equal(versionFromTag("release-2"), undefined);
});

test("reads README release links and badges", () => {
  const content = '<a href="https://example.test/releases/tag/v1.2.3"><img src="https://img.shields.io/badge/vers%C3%A3o-1.2.3-111111"></a>';
  assert.deepEqual(readmeVersions("R", content).map((source) => source.version), ["1.2.3", "1.2.3"]);
});

test("ZIP archives round-trip UTF-8 names and binary content", () => {
  const entries = [
    { name: "manifest.json", data: Buffer.from('{"name":"Conversão"}') },
    { name: "icon.png", data: Buffer.from([0, 1, 2, 255, 254]) },
    { name: "empty.txt", data: Buffer.alloc(0) }
  ];
  assert.deepEqual(readZip(createZip(entries)), entries);
});

test("ZIP reader detects corrupted content", () => {
  const archive = createZip([{ name: "a.txt", data: Buffer.from("aaaaaaaaaaaaaaaa") }]);
  const corrupted = Buffer.from(archive);
  // The reader trusts the central directory CRC, so corrupt that one.
  const centralCrcOffset = corrupted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 16;
  corrupted.writeUInt32LE(0, centralCrcOffset);
  assert.throws(() => readZip(corrupted), /CRC mismatch/);
});

function extensionEntries(manifest: object, extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    "content.js": "console.log(1);",
    "icon.png": "png",
    "manifest.json": JSON.stringify(manifest),
    "popup.html": "<html></html>",
    "popup.js": "console.log(2);",
    ...extra
  };
  return Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) }));
}

test("accepts a complete extension package", () => {
  assert.deepEqual(verifyPackageEntries(extensionEntries({ manifest_version: 3, version: "1.0.1" }), "1.0.1"), []);
});

test("rejects missing, unexpected, mis-versioned, and source-mapped files", () => {
  const entries = extensionEntries(
    { manifest_version: 3, version: "1.0.0" },
    { "popup.js": "x\n//# sourceMappingURL=popup.js.map", "popup.js.map": "{}" }
  ).filter((entry) => entry.name !== "icon.png");

  assert.deepEqual(verifyPackageEntries(entries, "1.0.1"), [
    "Missing file: icon.png",
    "Unexpected file: popup.js.map",
    "manifest.json: version 1.0.0 does not match 1.0.1.",
    "popup.js: contains a source map reference."
  ]);
});
