<h1 align="center">Web2Doc</h1>

<h3 align="center">Export web tables to CSV and print pages to PDF.</h3>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

<p align="center">
  <b>A Manifest V3 browser extension for exporting tables from the active page and saving pages through the browser's print dialog.</b>
</p>

<p align="center">
  <a href="https://github.com/czarist/WEB2DOC-PLUGIN/releases/tag/v1.0.2"><img alt="Version 1.0.2" src="https://img.shields.io/badge/version-1.0.2-111111?style=flat-square"></a>
  <img alt="Node.js 26 LTS" src="https://img.shields.io/badge/Node.js-26_LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Browser%20extension-Manifest%20V3-4285F4?style=flat-square">
  <img alt="Webpack" src="https://img.shields.io/badge/bundled%20with-Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"></a>
  <a href="https://github.com/czarist/WEB2DOC-PLUGIN/actions/workflows/check.yml"><img alt="CI: tests and build" src="https://img.shields.io/github/actions/workflow/status/czarist/WEB2DOC-PLUGIN/check.yml?branch=dev&amp;label=build&amp;style=flat-square&amp;logo=githubactions&amp;logoColor=white"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#development">Development</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

## Features

- **Export page tables to CSV.** Collects the rows and cells from every HTML table on the active page and downloads them as `exported_tables.csv`.
- **Clear export feedback.** The popup reports when the active page has no tables or cannot be reached.
- **Print a page to PDF.** Opens the browser's print dialog; choose the browser's save-to-PDF destination to create a PDF.
- **Popup controls.** Choose either action from the extension popup.

The CSV action currently exports CSV, not an Excel `.xlsx` workbook. The PDF action uses the browser's print workflow rather than generating a PDF file directly.

## Quick start

### Requirements

- Node.js 26.13 or newer within the 26.x LTS line and npm (`.nvmrc` pins the development version)
- Google Chrome or another Chromium-based browser with Manifest V3 extension support

### Build and load the extension

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` in the browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the generated `dist/` directory.
4. Open a regular webpage with HTML tables, then select the Web2Doc toolbar icon to export tables or print the page.

Re-run `npm run build` after changing source files, then use **Reload** on the extension card to load the updated build.

## How it works

```text
Popup button -> content script -> export controller -> CSV or print service
```

- `src/popup.ts` sends the selected action to the active tab.
- `src/content.ts` passes the action to `ExportController` and reports the result to the popup.
- `src/controllers/ExportController.ts` selects the CSV or PDF service.
- `src/services/CSVService.ts` reads page tables and starts a UTF-8 CSV download.
- `src/services/CSVFormatter.ts` escapes CSV fields and separates multiple tables.
- `src/services/PDFService.ts` calls `window.print()`.
- `src/manifest.json` defines the Manifest V3 extension, popup, content script, and permissions.

The extension content script is configured for all URLs. Browser-internal pages and other restricted pages do not allow extensions to run content scripts, so export actions are unavailable there.

## Development

Install dependencies, run the CSV, messaging, and print tests and type check, then build the extension:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

The CSV uses RFC 4180-style quoted fields, CRLF row endings, and a UTF-8 BOM to improve accented-text recognition in spreadsheet applications.

Run `npm run check` for all checks. The committed lockfile makes installations reproducible. Type checking uses TypeScript 7 (`tsc`). Webpack compiles TypeScript with `esbuild-loader`, which strips types without the TypeScript compiler API that TypeScript 7 no longer provides; `isolatedModules` and `verbatimModuleSyntax` keep this per-file compilation safe. Production bundles target ES2022 and omit inline source maps.

Run `npm run ci` locally to perform a clean install followed by all checks. GitHub Actions runs the same command on Linux, Windows, and macOS for pushes (including tags) and pull requests; it can also be started manually. Clean installation replaces `node_modules` with the locked dependencies.

## Releasing

Releases use [semantic versioning](https://semver.org/) and are identified by Git tags in the form `vMAJOR.MINOR.PATCH`. The version is recorded in `package.json`, `package-lock.json`, `src/manifest.json`, and the release link and version badge of both READMEs.

`npm run version:check` fails when these values disagree. Pass `-- --tag vX.Y.Z` to compare them with a planned tag; in GitHub Actions tag builds, the pushed tag is checked automatically. `npm run package` zips the built `dist/` folder into `release/web2doc-<version>.zip`, then reads the archive back and verifies that it contains exactly `content.js`, `icon.png`, `manifest.json`, `popup.html`, and `popup.js`, that the manifest version matches, and that no source maps are included. Both commands run as part of `npm run check`.

Release checklist:

1. Update the version with `npm version <major|minor|patch> --no-git-tag-version`, then update `src/manifest.json` and both README badges and release links.
2. Move the `Unreleased` changelog entries under the new version and date.
3. Run `npm run ci` and `npm run version:check -- --tag vX.Y.Z`.
4. Load `dist/` as an unpacked extension in each supported Chromium-based browser and confirm installation, CSV download (including accented text and a spreadsheet application import), the no-tables message, browser print-to-PDF, the restricted-page message, and that only `activeTab` is requested.
5. Merge into `main`, create and push the `vX.Y.Z` tag, and attach `release/web2doc-<version>.zip` to the GitHub release.

## Permissions and page access

The extension requests `activeTab` for the selected tab. Its content script is configured with the `<all_urls>` match pattern so it can run on regular webpages; browser-internal and restricted pages remain unavailable.

No `downloads`, `storage`, `scripting`, or persistent `host_permissions` are declared.

## Project layout

```text
src/
  content.ts
  controllers/
    ExportController.ts
  services/
    CSVService.ts
    CSVFormatter.ts
    PDFService.ts
  types/
    ExportResult.ts
  manifest.json
  popup.html
  popup.ts
scripts/
  check-version.ts
  package-extension.ts
  release/
webpack.config.js
tests/
  csv-formatter.test.ts
  export-services.test.ts
  popup.test.ts
  release.test.ts
  tab-export.test.ts
  helpers.ts
```

Tests are written in TypeScript and executed with `tsx`. `npm run typecheck` checks both application and test code; compiled test files are not committed.

## License

This project is licensed under the [MIT License](LICENSE).
