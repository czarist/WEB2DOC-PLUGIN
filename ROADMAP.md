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

- [ ] Escape embedded quotes according to CSV rules.
- [ ] Preserve commas and line breaks inside cell values.
- [ ] Verify non-ASCII text opens correctly in common spreadsheet applications.
- [ ] Give the user clear feedback when the active page has no exportable tables.

Acceptance: representative tables containing quotes, commas, line breaks, and accented text export as valid CSV; an empty page produces a clear outcome.

## 3. Improve export feedback and failure handling

Objective: make it clear when an export starts, completes, or cannot run.

- [ ] Report unsupported or restricted tabs instead of silently doing nothing.
- [ ] Surface failures from tab lookup and message delivery.
- [ ] Keep popup actions understandable when a page cannot be exported.

Acceptance: users receive actionable feedback for unavailable tabs and failed export requests, without changing successful export behavior.

## 4. Add automated verification

Objective: catch regressions in export behavior and keep the build repeatable.

- [ ] Add focused tests for table-to-CSV conversion and export edge cases.
- [ ] Add a test command and document it.
- [ ] Add a repeatable build and type-check validation path.

Acceptance: the documented test and build commands run successfully from a clean dependency install.

## 5. Prepare browser releases

Objective: verify the extension package and user-facing behavior before publishing.

- [ ] Test installation and export flows in supported Chromium-based browsers.
- [ ] Review the declared permissions against actual extension behavior.
- [ ] Document release packaging and versioning.

Acceptance: a release checklist covers installation, CSV download, browser print-to-PDF, permissions, and the packaged extension.
