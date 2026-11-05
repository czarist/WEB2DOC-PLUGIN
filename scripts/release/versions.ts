import { readFileSync } from "node:fs";
import path from "node:path";

export interface VersionSource {
  label: string;
  version: string | undefined;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Extracts the release tag link and version badge values from a README. */
export function readmeVersions(label: string, content: string): VersionSource[] {
  const tag = /releases\/tag\/v(\d+\.\d+\.\d+)/.exec(content)?.[1];
  const badge = /img\.shields\.io\/badge\/[^-"]+-(\d+\.\d+\.\d+)-/.exec(content)?.[1];
  return [
    { label: `${label} release link`, version: tag },
    { label: `${label} version badge`, version: badge }
  ];
}

/** Reads every place in the repository that records the release version. */
export function collectVersions(root: string): VersionSource[] {
  const pkg = readJson(path.join(root, "package.json"));
  const lock = readJson(path.join(root, "package-lock.json"));
  const lockPackages = lock["packages"] as Record<string, Record<string, unknown>> | undefined;
  const manifest = readJson(path.join(root, "src", "manifest.json"));

  return [
    { label: "package.json", version: stringField(pkg["version"]) },
    { label: "package-lock.json", version: stringField(lock["version"]) },
    { label: "package-lock.json root package", version: stringField(lockPackages?.[""]?.["version"]) },
    { label: "src/manifest.json", version: stringField(manifest["version"]) },
    ...readmeVersions("README.md", readFileSync(path.join(root, "README.md"), "utf8")),
    ...readmeVersions("README.pt-BR.md", readFileSync(path.join(root, "README.pt-BR.md"), "utf8"))
  ];
}

/**
 * Returns a list of problems; an empty list means all sources agree.
 * When `expected` is given (for example from a Git tag), every source must match it.
 */
export function findVersionProblems(sources: VersionSource[], expected?: string): string[] {
  const problems: string[] = [];
  const reference = expected ?? sources[0]?.version;

  if (expected !== undefined && !SEMVER.test(expected)) {
    problems.push(`Expected version "${expected}" is not in MAJOR.MINOR.PATCH form.`);
  }

  for (const source of sources) {
    if (source.version === undefined) {
      problems.push(`${source.label}: version not found.`);
    } else if (!SEMVER.test(source.version)) {
      problems.push(`${source.label}: "${source.version}" is not in MAJOR.MINOR.PATCH form.`);
    } else if (source.version !== reference) {
      problems.push(`${source.label}: found ${source.version}, expected ${reference}.`);
    }
  }

  return problems;
}

/** Converts a tag such as `v1.2.3` into `1.2.3`; returns undefined for other tags. */
export function versionFromTag(tag: string): string | undefined {
  return /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
}
