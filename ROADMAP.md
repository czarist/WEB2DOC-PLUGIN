# Roadmap

Web2Doc currently provides a popup, a CSV export for HTML tables on the active page, and a print-dialog action for saving a page as PDF. The project is a small Manifest V3 extension; the roadmap focuses first on reliable exports and verification before expanding the feature set.

## 1. Document the current extension

Objective: make the existing behavior and development setup clear to users and contributors.

- [x] Document the CSV and print-to-PDF workflows.
- [x] Document the extension architecture, permissions, and local build steps.
- [x] Add English and Brazilian Portuguese project documentation.

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

Acceptance: popup status text reports unavailable tabs, missing content scripts, invalid responses, and export results.

## 4. Add automated verification

Objective: catch regressions in export behavior and keep the build repeatable.

- [x] Add focused tests for CSV conversion and serialization edge cases.
- [x] Add a test command and document it.
- [x] Add repeatable build and type-check scripts.

Acceptance: `npm test`, `npm run typecheck`, and `npm run build` pass.

## 5. Prepare browser releases

Objective: verify the extension package and user-facing behavior before publishing.

- [ ] Test installation and export flows in supported Chromium-based browsers.
- [x] Review page access against actual extension behavior; remove unused permissions and unnecessary persistent host access.
- [ ] Document release packaging and versioning.

Acceptance: a release checklist covers installation, CSV download, browser print-to-PDF, permissions, and the packaged extension.
