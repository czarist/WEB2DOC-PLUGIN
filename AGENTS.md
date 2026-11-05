# Agent guide

Guidelines for contributors and coding agents working on Web2Doc.

## Project context

Web2Doc is a TypeScript browser extension using Manifest V3 and Webpack. Its popup sends actions to a content script; `ExportController` routes those actions to the CSV and print services.

- Table export currently downloads CSV; do not describe it as `.xlsx` export unless that capability is implemented.
- The PDF action calls the browser's `window.print()` workflow; it does not generate or download a PDF directly.
- The extension is configured to match all URLs, but browser-internal and restricted pages do not allow content scripts.

See [README.md](README.md) for user-facing behavior and setup, [ROADMAP.md](ROADMAP.md) for planned work, and [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Development

- Keep application code, identifiers, and comments in English. Keep the two README files synchronized when user-facing behavior or setup changes.
- Preserve the existing separation between popup messaging, `ExportController`, and export services unless a change requires a different design.
- Build with `npm install` followed by `npx webpack`; run `npx tsc --noEmit` for a TypeScript check.
- There is no automated test suite yet, and `npm test` is a placeholder that exits with an error. Do not report it as a passing test.
- Update the roadmap or changelog when a change materially affects project behavior or delivery.
