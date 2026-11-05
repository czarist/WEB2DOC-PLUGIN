<h1 align="center">Web2Doc</h1>

<h3 align="center">Export web tables to CSV and print pages to PDF.</h3>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

<p align="center">
  <b>A Manifest V3 browser extension for exporting tables from the active page and saving pages through the browser's print dialog.</b>
</p>

<p align="center">
  <img alt="Version 0.3.0" src="https://img.shields.io/badge/version-0.3.0-111111?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Browser%20extension-Manifest%20V3-4285F4?style=flat-square">
  <img alt="Webpack" src="https://img.shields.io/badge/bundled%20with-Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black">
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
- **Print a page to PDF.** Opens the browser's print dialog; choose the browser's save-to-PDF destination to create a PDF.
- **Popup controls.** Choose either action from the extension popup.

The CSV action currently exports CSV, not an Excel `.xlsx` workbook. The PDF action uses the browser's print workflow rather than generating a PDF file directly.

## Quick start

### Requirements

- Node.js and npm
- Google Chrome or another Chromium-based browser with Manifest V3 extension support

### Build and load the extension

```sh
npm install
npx webpack
```

1. Open `chrome://extensions` in the browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the generated `dist/` directory.
4. Open a regular webpage with HTML tables, then select the Web2Doc toolbar icon to export tables or print the page.

Re-run `npx webpack` after changing source files, then use **Reload** on the extension card to load the updated build.

## How it works

```text
Popup button -> content script -> export controller -> CSV or print service
```

- `src/popup.ts` sends the selected action to the active tab.
- `src/content.ts` passes the action to `ExportController`.
- `src/controllers/ExportController.ts` selects the CSV or PDF service.
- `src/services/CSVService.ts` reads page tables and triggers a CSV download.
- `src/services/PDFService.ts` calls `window.print()`.
- `src/manifest.json` defines the Manifest V3 extension, popup, content script, and permissions.

The extension content script is configured for all URLs. Browser-internal pages and other restricted pages do not allow extensions to run content scripts, so export actions are unavailable there.

## Development

Install dependencies and build the extension:

```sh
npm install
npx webpack
```

To run the TypeScript compiler without emitting files:

```sh
npx tsc --noEmit
```

There is no automated test suite configured yet; `npm test` is currently a placeholder that exits with an error.

## Permissions

The extension manifest declares:

| Permission | Purpose |
|---|---|
| `activeTab` | Grants temporary access to the active tab when the extension is invoked. |
| `scripting` | Declared in the manifest; the current source does not use the scripting API. |
| `downloads` | Declared in the manifest; the current source triggers the CSV download through a page link. |
| `storage` | Declared in the manifest; the current source does not use extension storage. |
| `<all_urls>` host access | Match regular webpages for the content script. |

## Project layout

```text
src/
  background.ts
  content.ts
  controllers/
    ExportController.ts
  services/
    CSVService.ts
    PDFService.ts
  manifest.json
  popup.html
  popup.ts
webpack.config.js
```
