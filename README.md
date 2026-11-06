<h1 align="center">Web2Doc</h1>

<h3 align="center">Save web pages, parts of pages and tables as PDF, images, Markdown, JSON, Word, Excel and CSV.</h3>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

<p align="center">
  <b>A Manifest V3 browser extension that exports what you see on a page, entirely on your device.</b>
</p>

<p align="center">
  <a href="https://github.com/czarist/WEB2DOC-PLUGIN/releases/tag/v2.1.2"><img alt="Version 2.1.2" src="https://img.shields.io/badge/version-2.1.2-111111?style=flat-square"></a>
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

Everything runs in your browser. Pages, files and images are never sent to a server.

### Save a page or part of it

- **Whole page as PDF.** Captures the page as it looks on screen, with styles, backgrounds, images and clickable links, as an A4 PDF with an outline built from its headings. Lazy images are loaded first, and fixed headers are unpinned so they are not repeated on every page. Optionally adds the page title and address at the top of each page, the date and page numbers at the bottom, and a QR code that links to the page.
- **Part of the page.** Choose **Save part of the page**, then click the section you want, or move the outline with the arrow keys and press Enter. Elements inside open shadow roots and whole frames can be chosen too. **Select larger area** grows the selection, **Choose again** starts over, and **Use main content** selects the page's main area.
- **Edit before saving.** Inside the selection, pick a tool and click:
  - **Exclude** leaves a part out; click it again to bring it back.
  - **Highlight** marks a part in yellow.
  - **Arrow** points an arrow at a part.
  - **Comment** adds a note below a part.
  - **Redact** blacks a part out. Its text, link addresses and image descriptions are removed from the saved file, not only covered.
  - **Page break** starts a new PDF page before a part.
  - **Move** reorders the blocks of the selection.

  **Undo** and **Restore all** take changes back. Set the title and the file name, then **Review** shows the page with only what will be saved. Save it as **PDF**, **image (PNG)**, **Markdown**, **JSON**, **Word (DOCX)**, or open it in **text recognition (OCR)**, or copy it as Markdown. Press Esc at any time to cancel: Esc first closes an open comment or move, then the tools. The page is restored after saving, going back, canceling, or a failed export.
- **An area of the page.** **Save an area** lets you drag a rectangle and save it as a PNG, a PDF of that image, or recognized text.

### Documents and data

- **Main content as Markdown, JSON or Word.** Headings, paragraphs, lists, tables, links, images and code blocks are kept; navigation, banners, sidebars, forms and footers are left out. Markdown starts with the title, address and capture date, and can be copied to the clipboard. JSON follows the versioned schema in [`schemas/web2doc-document-v1.schema.json`](schemas/web2doc-document-v1.schema.json). Word documents use real headings, numbered and bulleted lists, tables, hyperlinks and embedded images, and start with the source address and capture date.
- **Tables as Excel or CSV.** The popup lists the page's tables with titles, sizes and previews, and outlines each one on the page with the same number. Excel workbooks get one worksheet per table with valid, unique names, a frozen header row and filters. Identifiers with leading zeros stay text, and page text is always written as text, even when it starts with `=`, `+`, `-` or `@`. Numbers, dates, percentages and currencies are converted when the page language makes them unambiguous (for example `1.234,56` on a Portuguese page); anything ambiguous stays as written. CSV files are UTF-8 with a byte order mark.
- **Links and metadata.** An Excel workbook listing every link (text, address, internal or external) and the page metadata: title, canonical address, language, description, Open Graph and Twitter tags, headings and word count.

### Tools

- **Offline archive.** Saves the page with its images, styles and fonts as a single MHTML file that opens without a connection.
- **Page images.** Downloads the images the page shows as a ZIP, with a list of where each came from.
- **Text from screen.** Recognizes the text in the visible part of the page. Recognition runs on the device with English and Portuguese language data that ship with the extension.
- **Compare captures.** Saves the text of the page's main content; the next time you run it on the same page, it shows the lines that were added and removed.
- **Page QR code.** Shows a QR code for the page and lets you download it as SVG.

### Presets, shortcuts and batches

- **Presets** save what to export and in which format. Built in: **Clean article (PDF)**, **Tables only (Excel)**, **Technical documentation (Markdown)**, **Full page (PDF)** and **Offline archive (MHTML)**. Add your own in the settings. Run a preset from the popup, the right-click menu, a keyboard shortcut or a batch export.
- **Keyboard shortcuts:** Alt+Shift+F saves the page as PDF, Alt+Shift+S starts a selection, and Alt+Shift+D runs the default preset. They can be changed on the browser's shortcuts page.
- **Right-click menu:** save the page, start a selection or an area, save the main content as Markdown, export tables to Excel, or run any preset. The outcome appears on the toolbar icon.
- **Export several tabs.** Choose tabs in the current window, apply a preset, and download one ZIP (with a report of every tab) or one combined PDF. Each tab shows its progress, and the completed exports are downloaded even when some tabs fail.
- **Settings and history.** Set the file name pattern (`{title}`, `{date}`, `{time}`, `{host}`, `{label}`), the PDF header and footer, the default preset, and keep or clear a local list of recent exports.

While a PDF, image or archive is being captured, the browser shows a bar saying that Web2Doc started debugging the browser; it disappears when the capture finishes. Close DevTools on the tab before capturing. Content inside frames can be saved as a whole frame, but not chosen part by part.

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
4. Open a regular webpage and select the Web2Doc toolbar icon.

Re-run `npm run build` after changing source files, then use **Reload** on the extension card to load the updated build.

## How it works

```text
Tables and documents: popup -> content script -> page exporter -> background download
Part of a page:        popup -> content script -> selection tools -> prepared page -> background capture
Whole page and tools:  popup -> background service worker -> capture service (DevTools protocol)
Presets and batches:   popup, menu, shortcut or batch page -> export engine -> content script or capture service
```

The source is grouped by feature:

- `src/popup/` is the toolbar popup: `popup.ts` wires the actions, `TabExportService.ts` sends them to the page or the background, and `TablePicker.ts` is the table list.
- `src/content/` runs in the page: `ContentRouter.ts` validates and routes requests, and `PageExporter.ts` builds tables, documents and the link inventory.
- `src/selection/` is the "save part of the page" feature: `SelectionPanel.ts` draws the outlines and the panel, `SelectionController.ts` runs the steps (choosing, editing, reviewing, saving, Esc and failures), and `PageSelection.ts` records the user's changes and applies them to the page temporarily, restoring every attribute, text and link afterwards.
- `src/tables/` finds tables, reads their cells, formats CSV and draws the picker's outlines.
- `src/document/` turns part of a page into a document model (headings, lists, tables, code, links, images, notes).
- `src/formats/` writes files without external libraries: ZIP, XLSX (with the cell value rules), DOCX and Markdown/JSON.
- `src/background/` holds the privileged work: `BackgroundRouter.ts` decides which requests are allowed, `PageCaptureService.ts` captures PDFs, images, archives and image files through `chrome.debugger`, and `ExportEngine.ts` runs presets and batch exports.
- `src/pages/` contains the extension pages: settings and history, batch export, text recognition and capture comparison.
- `src/shared/` holds what every context uses: message types and their runtime checks, file names and downloads, settings storage, the line comparison, QR codes and the page overlay.

The background service worker accepts capture requests only from the extension's own pages, or from the content script in the top frame of the tab being captured. The content script is configured for all URLs, but browser-internal and restricted pages do not allow it, so the popup explains that those pages cannot be exported.

For development, `npm run dev` builds in watch mode and opens Chrome with a separate profile and the extension already loaded; each rebuild reloads the extension. Pass a start page with `npm run dev -- <url>`, or set `CHROME_PATH` to use another Chromium-based browser.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:browser
```

- `npm test` runs the unit tests with browser API and DOM doubles, and `linkedom` for document extraction.
- `npm run typecheck` checks the extension, the tests and the scripts with TypeScript 7.
- `npm run test:browser` loads the built extension into Chromium (`CHROME_PATH`, or the Chromium installed by `npx playwright install chromium`), drives every feature with real clicks, keys and drags through the DevTools protocol, and then opens each downloaded file with pypdf, openpyxl, python-docx and Pillow. Run `npm run build` first. Batch export needs the optional `tabs` permission, which a headless browser cannot grant through its prompt, so the script uses a copy of the build that grants it at install time.

Run `npm run check` for type checking, version checks, unit tests, the build and the package. The committed lockfile makes installations reproducible. Webpack compiles TypeScript with `esbuild-loader`; `isolatedModules` and `verbatimModuleSyntax` keep this per-file compilation safe. Production bundles target ES2022, keep license notices inline, are written as ASCII so every Chromium version reads them as UTF-8, and omit source maps.

Runtime libraries are bundled into the extension, never loaded from the network: `pdf-lib` (combined and image PDFs), `qrcode-generator` (QR codes) and `tesseract.js` with its WebAssembly core and English and Portuguese language data (text recognition).

Run `npm run ci` locally to perform a clean install followed by all checks. GitHub Actions runs the same command on Linux, Windows, and macOS for pushes (including tags) and pull requests; it can also be started manually. Clean installation replaces `node_modules` with the locked dependencies.

## Releasing

Releases use [semantic versioning](https://semver.org/) and are identified by Git tags in the form `vMAJOR.MINOR.PATCH`. The version is recorded in `package.json`, `package-lock.json`, `src/manifest.json`, and the release link and version badge of both READMEs.

`npm run version:check` fails when these values disagree. Pass `-- --tag vX.Y.Z` to compare them with a planned tag; in GitHub Actions tag builds, the pushed tag is checked automatically. `npm run package` zips the built `dist/` folder into `release/web2doc-<version>.zip`, then reads the archive back and verifies that it contains exactly the expected scripts, pages, icons and text recognition files, that the manifest version matches, that every script is valid UTF-8, and that no source maps are included. Both commands run as part of `npm run check`.

Release checklist:

1. Update the version with `npm version <major|minor|patch> --no-git-tag-version`, then update `src/manifest.json` and both README badges and release links.
2. Move the `Unreleased` changelog entries under the new version and date.
3. Run `npm run ci`, `npm run test:browser` and `npm run version:check -- --tag vX.Y.Z`.
4. Load `dist/` as an unpacked extension in each supported Chromium-based browser and try the popup actions, saving part of a page with each tool, the right-click menu and shortcuts, a batch export, and the permission prompt for batch export.
5. Merge into `main`, create and push the `vX.Y.Z` tag, and attach `release/web2doc-<version>.zip` to the GitHub release.

## Permissions and page access

| Permission | Used for |
|---|---|
| `activeTab` | Access to the tab you are using when you open the popup, use a shortcut or the right-click menu. |
| `debugger` | Rendering PDFs and images, saving offline archives and reading the page's image files through the DevTools protocol. It is attached only during a capture, only to the tab being captured. |
| `downloads` | Saving the files Web2Doc creates. |
| `storage` | Preferences, presets, the export history and comparison captures, kept in this browser only. |
| `contextMenus` | The Web2Doc entries in the right-click menu. |
| `tabs` (optional) | Listing tab titles and addresses on the **Export several tabs** page. It is requested only when you open that page, and can be removed from the extension's details at any time. |

No persistent `host_permissions` are declared, and no data leaves the device. Because of the `debugger` permission, the browser shows a stronger warning when the extension is installed.

## Project layout

```text
src/
  background/   background.ts, BackgroundRouter.ts, ExportEngine.ts, PageCaptureService.ts
  content/      content.ts, ContentRouter.ts, PageExporter.ts
  document/     extract.ts, model.ts
  formats/      cellValues.ts, docx.ts, markdown.ts, xlsx.ts, zip.ts
  pages/        options, batch, ocr and compare pages, pages.css
  popup/        popup.html, popup.ts, TabExportService.ts, TablePicker.ts
  selection/    PageSelection.ts, SelectionController.ts, SelectionPanel.ts
  shared/       diff.ts, files.ts, messages.ts, PageOverlay.ts, qr.ts, settings.ts
  tables/       CSVFormatter.ts, TableHighlighter.ts, TableService.ts
  icons/
  manifest.json
schemas/
  web2doc-document-v1.schema.json
scripts/
  check-version.ts, dev.ts, package-extension.ts, release/
tests/
  *.test.ts     unit tests
  browser/      real-browser verification (npm run test:browser)
webpack.config.js
```

Tests are written in TypeScript and executed with `tsx`. `npm run typecheck` checks both application and test code; compiled test files are not committed.

## License

This project is licensed under the [MIT License](LICENSE).
