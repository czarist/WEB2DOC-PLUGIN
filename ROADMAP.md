# Roadmap

Web2Doc currently provides a popup, a CSV export for HTML tables on the active page, and a PDF export that captures the page with its screen styles, images, and links. The project is a small Manifest V3 extension; the roadmap focuses first on reliable exports and verification before expanding the feature set.

Last updated: 2026-11-05. This roadmap tracks the current `dev` branch, including work completed after the `v1.1.2` tag.

## 1. Document the current extension

Objective: make the existing behavior and development setup clear to users and contributors.

- [x] Document the CSV and print-to-PDF workflows.
- [x] Document the extension architecture, permissions, and local build steps.
- [x] Add English and Brazilian Portuguese project documentation.
- [x] Add the MIT license and license, Node.js, version, and live CI badges to both READMEs.

Acceptance: a contributor can build the extension and load `dist/` as an unpacked extension using the README.

## 2. Make CSV exports robust

Objective: produce valid CSV for common table cell contents and handle pages without tables clearly.

- [x] Escape embedded quotes according to CSV rules.
- [x] Preserve commas and line breaks inside cell values.
- [x] Add a UTF-8 BOM and automated checks for non-ASCII text.
- [ ] Verify spreadsheet compatibility in common spreadsheet applications during browser release checks.
- [x] Give the user clear feedback when the active page has no exportable tables.

Acceptance: focused tests verify quotes, commas, line breaks, multiple tables, and accented text; an empty page reports that no HTML tables were found.

## 3. Improve export feedback and failure handling

Objective: make it clear when an export starts, completes, or cannot run.

- [x] Report unsupported or restricted tabs instead of silently doing nothing.
- [x] Surface failures from tab lookup and message delivery.
- [x] Keep popup actions understandable when a page cannot be exported.
- [x] Use promise-based tab messaging and validate responses at runtime.
- [x] Verify that popup controls are restored after failed message delivery.

Acceptance: popup status text reports unavailable tabs, missing content scripts, invalid responses, and export results.

## 4. Add automated verification

Objective: catch regressions in export behavior and keep the build repeatable.

- [x] Add focused tests for CSV conversion and serialization edge cases.
- [x] Add a test command and document it.
- [x] Add repeatable build and type-check scripts.
- [x] Migrate all tests to TypeScript and include them in strict type checking.
- [x] Cover tab lookup and messaging errors, invalid responses, printing, CSV downloads, and object URL cleanup.
- [x] Standardize development on Node.js 26 LTS with `.nvmrc` and package engine requirements.
- [x] Update build dependencies, target ES2022, and retain TypeScript 6 for `ts-loader` compatibility.
- [x] Upgrade to TypeScript 7 for type checking and compile bundles with `esbuild-loader` instead of `ts-loader`.
- [x] Commit the npm lockfile and use `npm ci` for reproducible installation.
- [x] Provide `npm run ci` for clean installation, type checking, tests, and production builds.
- [x] Run the same CI command on Linux, Windows, and macOS for pushes, tags, pull requests, and manual runs.

Acceptance: `npm run ci` passes locally and in the three-platform GitHub Actions matrix. The current suite contains 30 tests using browser API doubles; real browser verification remains part of release preparation.

## 5. Prepare browser releases

Objective: verify the extension package and user-facing behavior before publishing.

- [ ] Test installation and export flows in supported Chromium-based browsers.
- [x] Review page access against actual extension behavior; remove unused permissions and unnecessary persistent host access.
- [x] Clean build output and omit inline source maps from production bundles.
- [x] Publish Git tags `v1.0.0`, `v1.0.1`, `v1.0.2`, and `v1.1.2`.
- [x] Align package, lockfile, manifest, and README versions to `1.1.2` on `dev`.
- [x] Document release packaging and versioning.
- [x] Automate version consistency checks before creating future release tags.
- [x] Produce an installable extension archive and verify its contents before publishing.

Acceptance: the README release checklist covers installation, CSV download, styled PDF download, permissions, and the packaged extension.

## 6. Richer exports and popup

Objective: let users choose what to export and get files that match what they see on the page.

- [x] Let users choose which tables to export, with titles, sizes, and previews in the popup and numbered outlines on the page.
- [x] Read CSV cells as rendered text, without hidden sort keys or embedded styles.
- [x] Generate PDFs with screen styles, backgrounds, lazy-loaded images, clickable links, and a heading outline instead of opening the print dialog.
- [x] Redesign the popup with light and dark themes, keyboard focus, and color-coded status messages.
- [x] Replace the extension icon with a minimal icon set, including a pixel-aligned 16 px toolbar version.
- [x] Add `npm run dev` to build in watch mode and open Chrome with the extension loaded.
- [ ] Verify the table picker, page highlights, and PDF capture on a range of real websites during release checks.

Acceptance: users can export only the tables they select and save a PDF that keeps the page's look and links; automated tests cover table discovery, selection, and PDF capture with browser API doubles.
