// Fails when the recorded release versions disagree, or differ from a release tag.
// Usage: tsx scripts/check-version.ts [--tag vX.Y.Z]
// In GitHub Actions tag builds, the tag is read from GITHUB_REF_NAME.
import path from "node:path";
import { collectVersions, findVersionProblems, versionFromTag } from "./release/versions.ts";

const root = path.resolve(import.meta.dirname, "..");
const tagFlag = process.argv.indexOf("--tag");
const tag = tagFlag >= 0
  ? process.argv[tagFlag + 1]
  : process.env["GITHUB_REF_TYPE"] === "tag" ? process.env["GITHUB_REF_NAME"] : undefined;

const problems: string[] = [];
let expected: string | undefined;
if (tag !== undefined) {
  expected = versionFromTag(tag);
  if (expected === undefined) problems.push(`Tag "${tag}" is not in vMAJOR.MINOR.PATCH form.`);
}

const sources = collectVersions(root);
problems.push(...findVersionProblems(sources, expected));

if (problems.length > 0) {
  console.error("Version check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Version check passed: ${sources[0]?.version}${tag ? ` (tag ${tag})` : ""}.`);
