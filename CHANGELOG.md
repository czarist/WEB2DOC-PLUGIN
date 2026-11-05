# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are identified by Git tags.

## [Unreleased]

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
