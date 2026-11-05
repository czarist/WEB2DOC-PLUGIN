# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project does not currently publish versioned releases.

## [Unreleased]

### Changed

- CSV downloads now escape embedded quotes, preserve commas and line breaks in cells, separate multiple tables, use CRLF row endings, and include a UTF-8 BOM.
- Export services return typed results to the popup, which reports empty pages, unavailable tabs, invalid responses, and export outcomes.
- The extension no longer declares unused storage, downloads, scripting, or persistent host permissions.
- Remove the unused background service worker and align the manifest description with CSV export and browser printing.
- Remove unused Excel-export and webpack-cleaning dependencies; update `copy-webpack-plugin` to a patched release.

### Added

- Focused CSV and controller tests, plus `build`, `test`, and `typecheck` npm scripts.
- English and Brazilian Portuguese READMEs, a roadmap, and an `AGENTS.md` guide.
