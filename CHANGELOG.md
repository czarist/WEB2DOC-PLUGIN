# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are identified by Git tags.

## [Unreleased]

### Added

- Save part of a page. The popup's **Save part of the page** action opens tools on the page: an outline follows the pointer or the arrow keys, and a click or Enter chooses the section. Elements inside open shadow roots and whole frames can be chosen. Inside the selection, tools exclude, highlight, point an arrow at, comment on, redact, add a page break before, or move parts, with undo and restore all. Users set the title and file name, review the page with only what will be saved, and save it as PDF, PNG, Markdown, JSON or Word, send it to text recognition, or copy it as Markdown. Esc cancels at any time, and the page is restored after saving, going back, canceling, or a failed export.
- Redaction removes the redacted text, link addresses and alternative texts from the saved file instead of only covering them.
- Save an area: drag a rectangle and save it as PNG, as a PDF of that image, or as recognized text.
- Excel export for tables: one worksheet per table with valid, unique names, frozen headers and filters. Leading zeros and formula-like text stay text; numbers, dates, percentages and currencies are converted when the page language makes them unambiguous.
- Markdown, JSON and Word exports of the page's main content or of a selection, with the title, address and capture date. JSON follows the versioned schema in `schemas/web2doc-document-v1.schema.json`. Markdown can be copied to the clipboard.
- Tools: offline archive (MHTML), page images as a ZIP, links and metadata as an Excel workbook, local text recognition of the visible area (English and Portuguese, bundled), comparison between captures of a page, and a QR code for the page.
- Presets (clean article, tables only, technical documentation, full page, offline archive, and custom ones), keyboard shortcuts (Alt+Shift+F, Alt+Shift+S, Alt+Shift+D), a right-click menu, and a settings page with the file name pattern, PDF header and footer with page numbers and a source QR code, the default preset, and a local export history.
- Export several tabs: apply a preset to tabs of the current window and download a ZIP with a report or one combined PDF, with progress for each tab and the completed exports kept when some tabs fail.
- `npm run test:browser` drives every feature in Chromium with the built extension and opens the downloaded files with independent readers.

### Changed

- The source is grouped by feature (`popup`, `content`, `selection`, `tables`, `document`, `formats`, `background`, `pages`, `shared`); release packaging uses the same ZIP code as the extension.
- New permissions: `storage` (settings, presets, history), `contextMenus` (right-click menu), and `tabs` as an optional permission requested only by the batch export page.
- Files built in the page are saved through the background service worker, so repeated exports from one page are not stopped by the browser's protection against multiple downloads.
- The popup groups the actions by page, tables, tools and presets.
- The table highlights and the selection tools share one overlay layer drawn in a closed shadow root.
- The message for pages Web2Doc cannot access now names the unsupported pages and suggests reloading the page.
- Typed file names that already end in the file's extension are no longer saved with a doubled extension.

### Fixed

- After a whole-page PDF capture, fixed and sticky elements no longer keep an empty `style` attribute; their original inline styles are restored exactly.
- Web2Doc's own outlines and confirmation messages no longer appear in captures.
- Production bundles are written as ASCII, so Chromium no longer rejects a script as not UTF-8 encoded; packaging now checks every script's encoding.

## [1.1.2] - 2026-11-05

### Added

- CSV export now opens a table picker: the popup lists the page's tables with titles, sizes, and previews, the page outlines and numbers each table, and only the checked tables are exported.
- `npm run dev` builds in watch mode and opens Chrome with a separate profile and the extension loaded.

### Changed

- CSV cells are read as rendered text, which drops hidden sort keys and embedded style text, separates words split by line breaks, and trims surrounding whitespace.
- The PDF action now generates and downloads a PDF of the page with its screen styles, backgrounds, lazy-loaded images, clickable links, and a heading outline, instead of opening the print dialog. It uses a background service worker and the `debugger` and `downloads` permissions.
- Redesign the popup with described actions, light and dark themes, visible keyboard focus, and color-coded status messages.
- Replace the extension icon with a new minimal icon in 16, 32, 48, and 128 px sizes, including a pixel-aligned 16 px toolbar version.

## [1.0.2] - 2026-11-05

### Added

- `npm run version:check` verifies that package, lockfile, manifest, and README versions agree, and match the Git tag in tag builds.
- `npm run package` creates `release/web2doc-<version>.zip` from `dist/` and verifies the archive contents.
- Release packaging, versioning, and a release checklist in both READMEs.

### Changed

- Upgrade TypeScript to 7.0.2 and replace `ts-loader` with `esbuild-loader`, because TypeScript 7 no longer provides the compiler API that `ts-loader` requires.
- Migrate all tests to TypeScript and include strict test type checking in local and GitHub CI.

## [1.0.1] - 2026-11-05

### Added

- macOS CI checks alongside Linux and Windows.

## [1.0.0] - 2026-11-05

### Changed

- Update development dependencies, standardize on Node.js 26 LTS, and retain TypeScript 6 for `ts-loader` compatibility.
- Target ES2022 with stricter type checking, clean production output, and omit inline source maps.
- Use promise-based tab messaging with runtime response validation.
- Change the project license from ISC to MIT and add the full license text.
- CSV downloads now escape embedded quotes, preserve commas and line breaks in cells, separate multiple tables, use CRLF row endings, and include a UTF-8 BOM.
- Export services return typed results to the popup, which reports empty pages, unavailable tabs, invalid responses, and export outcomes.
- The extension no longer declares unused storage, downloads, scripting, or persistent host permissions.
- Remove the unused background service worker and align the manifest description with CSV export and browser printing.
- Remove unused Excel-export and webpack-cleaning dependencies; update `copy-webpack-plugin` to a patched release.

### Added

- Node.js badges, `.nvmrc`, a committed npm lockfile, and a combined `check` script.
- Shared local and GitHub Actions CI command (`npm run ci`), with Linux and Windows checks on pushes, tags, pull requests, and manual runs.
- Regression tests for tab messaging errors, response validation, printing, CSV downloads, and object URL cleanup.
- Focused CSV and controller tests, plus `build`, `test`, and `typecheck` npm scripts.
- English and Brazilian Portuguese READMEs, a roadmap, and an `AGENTS.md` guide.
