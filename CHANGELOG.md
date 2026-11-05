# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are identified by Git tags.

## [Unreleased]

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
