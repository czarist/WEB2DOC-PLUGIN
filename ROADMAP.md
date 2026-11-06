# Roadmap

Web2Doc saves pages, parts of pages and tables as PDF, PNG, Markdown, JSON, Word, Excel and CSV, with in-page editing tools, presets, batch export and local text recognition. Everything runs on the device. The feature stages below were planned together and are implemented on `dev`; the open items are the checks that still need real applications or a person at the browser.

Last updated: 2026-11-05. This roadmap tracks the current `dev` branch, including work completed after the `v1.1.2` tag. Items are checked only when they are implemented and verified; "verified in Chromium" means `npm run test:browser` drove the feature in a real Chromium with the extension loaded and the resulting files were opened by independent readers (pypdf, openpyxl, python-docx, Pillow).

## Foundations

### 1. Document the current extension

Objective: make the existing behavior and development setup clear to users and contributors.

- [x] Document the CSV and print-to-PDF workflows.
- [x] Document the extension architecture, permissions, and local build steps.
- [x] Add English and Brazilian Portuguese project documentation.
- [x] Add the MIT license and license, Node.js, version, and live CI badges to both READMEs.

Acceptance: a contributor can build the extension and load `dist/` as an unpacked extension using the README.

### 2. Make CSV exports robust

Objective: produce valid CSV for common table cell contents and handle pages without tables clearly.

- [x] Escape embedded quotes according to CSV rules.
- [x] Preserve commas and line breaks inside cell values.
- [x] Add a UTF-8 BOM and automated checks for non-ASCII text.
- [ ] Verify spreadsheet compatibility in common spreadsheet applications during browser release checks.
- [x] Give the user clear feedback when the active page has no exportable tables.

Acceptance: focused tests verify quotes, commas, line breaks, multiple tables, and accented text; an empty page reports that no HTML tables were found.

### 3. Improve export feedback and failure handling

Objective: make it clear when an export starts, completes, or cannot run.

- [x] Report unsupported or restricted tabs instead of silently doing nothing.
- [x] Surface failures from tab lookup and message delivery.
- [x] Keep popup actions understandable when a page cannot be exported.
- [x] Use promise-based tab messaging and validate responses at runtime.
- [x] Verify that popup controls are restored after failed message delivery.

Acceptance: popup status text reports unavailable tabs, missing content scripts, invalid responses, and export results.

### 4. Add automated verification

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

- [x] Add a real-browser verification (`npm run test:browser`) that drives every feature in Chromium and checks the downloaded files.

Acceptance: `npm run ci` passes locally and in the three-platform GitHub Actions matrix. The unit suite contains 58 tests using browser API and DOM doubles; `npm run test:browser` runs 66 browser checks and verifies 22 downloaded files.

### 5. Prepare browser releases

Objective: verify the extension package and user-facing behavior before publishing.

- [ ] Test installation and export flows by hand in each supported Chromium-based browser (automated checks run in Chromium only).
- [x] Review page access against actual extension behavior; remove unused permissions and unnecessary persistent host access.
- [x] Clean build output and omit inline source maps from production bundles.
- [x] Publish Git tags `v1.0.0`, `v1.0.1`, `v1.0.2`, and `v1.1.2`.
- [x] Align package, lockfile, manifest, and README versions to `1.1.2` on `dev`.
- [x] Document release packaging and versioning.
- [x] Automate version consistency checks before creating future release tags.
- [x] Produce an installable extension archive and verify its contents before publishing.

Acceptance: the README release checklist covers installation, CSV download, styled PDF download, saving part of a page, permissions, and the packaged extension.

### 6. Richer exports and popup

Objective: let users choose what to export and get files that match what they see on the page.

- [x] Let users choose which tables to export, with titles, sizes, and previews in the popup and numbered outlines on the page.
- [x] Read CSV cells as rendered text, without hidden sort keys or embedded styles.
- [x] Generate PDFs with screen styles, backgrounds, lazy-loaded images, clickable links, and a heading outline instead of opening the print dialog.
- [x] Redesign the popup with light and dark themes, keyboard focus, and color-coded status messages.
- [x] Replace the extension icon with a minimal icon set, including a pixel-aligned 16 px toolbar version.
- [x] Add `npm run dev` to build in watch mode and open Chrome with the extension loaded.
- [ ] Verify the table picker, page highlights, and PDF capture on a range of real websites during release checks.

Acceptance: users can export only the tables they select and save a PDF that keeps the page's look and links; automated tests cover table discovery, selection, and PDF capture with browser API doubles.

## Feature stages

### Stage 1. Visual selection and page preparation

Objective: let users choose exactly which part of a page to export, change it, and check the result before saving.

- [x] Choose a section or element by clicking the page, with a visible outline and size label for the element under the pointer and a solid outline for the selection.
- [x] Move the outline with the arrow keys and choose with Enter, in addition to Use main content and Select larger area. Verified in Chromium.
- [x] Exclude elements, bring them back, undo the last change, and restore all changes.
- [x] Adjust the title (stored in the PDF metadata) and the file name, following the file name pattern from the settings.
- [x] Review the prepared page, showing only what will be saved, before saving.
- [x] Save the selection as PDF, PNG, Markdown, JSON or Word, send it to text recognition, or copy it as Markdown. Verified in Chromium.
- [x] Prepare the page only during review and capture, and restore every attribute, text, link and the title after saving, going back, canceling, pressing Escape, or a failed capture. Verified in Chromium and covered by unit tests.
- [x] Report incompatible tabs, such as browser pages, in the popup.
- [x] Choose elements inside open shadow roots, and choose whole frames through a cover drawn over them. Verified in Chromium.
- [x] Rectangular crop: draw an area and save it as PNG, as a PDF of that image, or as recognized text. Verified in Chromium.
- [x] Manual page breaks before chosen parts. Verified in the PDF page count.
- [x] Reorder the blocks of the selection with a temporary flex layout, restored afterwards. Verified on the rendered PDF.
- [ ] Choose parts inside frames, which would need the content script in every frame.
- [ ] Try the selection tools on a range of real websites, including application layouts with nested scroll containers.

Acceptance: users can save only the chosen part of a page, without excluded or redacted content in the file, and the original page is left unchanged whether they save, cancel, or the capture fails.

### Stage 2. XLSX export

Objective: export the chosen tables as a real spreadsheet.

- [x] Reuse the table picker and page highlights to choose the tables, with a choice between Excel and CSV.
- [x] Write one worksheet per table, with valid, unique sheet names derived from the table titles.
- [x] Freeze header rows and add filters when a table has a header row.
- [x] Preserve identifiers with leading zeros as text.
- [x] Convert numbers, dates, percentages and currencies only when the page language makes them unambiguous, and keep the original text otherwise.
- [x] Write page text as inline text, never as formulas, including values that start with `=`, `+`, `-` or `@`. Verified with openpyxl.
- [ ] Open the workbooks in Microsoft Excel and LibreOffice Calc and confirm there are no repair prompts.

Acceptance: tests and the browser verification cover sheet naming, frozen headers, filters, leading zeros, conversions and formula-like text.

### Stage 3. Markdown and JSON

Objective: export page content in formats that are easy to reuse in other tools.

- [x] Export the selection, or the page's main content without page chrome, with headings, lists, tables, links, images and code blocks.
- [x] Include the page title, address and capture date.
- [x] Version the JSON schema (`schemas/web2doc-document-v1.schema.json`) and validate the export against it in the tests.
- [x] Copy the Markdown to the clipboard from the popup or the selection review. Verified in Chromium.

Acceptance: exported structure matches the page for article-like layouts, and the JSON validates against its published schema version.

### Stage 4. Editable DOCX

Objective: produce a document that can be edited in word processors.

- [x] Keep the document structure with headings, numbered and bulleted lists, tables, embedded images and hyperlinks; images that cannot be downloaded become links.
- [x] Include the source address and capture date in the document and its properties. Verified with python-docx.
- [ ] Open the documents in Microsoft Word and LibreOffice Writer and confirm that headings stay navigable.

### Stage 5. Presets and quick actions

- [x] Built-in presets (clean article, tables only, technical documentation, full page, offline archive) and custom presets in the settings page.
- [x] File name pattern, PDF header and footer with page numbers, and a QR code for the source. Verified in the rendered PDF.
- [x] Keyboard shortcuts and a right-click menu with every preset; the outcome is shown on the toolbar icon.
- [x] Local export history that can be turned off or cleared.
- [ ] Press the shortcuts and use the right-click menu by hand; the automated check confirms they are registered, but a headless browser cannot open the menu or send browser shortcuts.

### Stage 6. Annotations and data removal

- [x] Highlights, arrows and comments in the selection, carried into PDF, PNG, Markdown, JSON and Word.
- [x] Redaction that replaces text, removes link addresses and alternative texts during capture, and writes a redaction marker in documents. Verified in Chromium: the redacted text and link address are absent from the PDF text layer and link annotations.

### Stage 7. Batch export

- [x] Select tabs in the current window, apply a preset, and download a ZIP with a report or one combined PDF.
- [x] Show progress and the result of each tab, and download the completed exports even when some tabs fail. Verified in Chromium.
- [x] Ask for the optional `tabs` permission only when the batch page is used.
- [ ] Accept the permission prompt by hand; the automated check uses a build copy that grants the permission at install time.

### Stage 8. OCR, offline capture and extraction tools

- [x] Local text recognition in English and Portuguese with tesseract.js, bundled with the extension and run offline. Verified in Chromium.
- [x] Offline archive (MHTML) with the page's resources embedded.
- [x] Image export as a ZIP, read from the browser cache or loaded again through the browser when needed.
- [x] Link and metadata inventory as an Excel workbook.
- [x] QR code for the source page in the popup and in the PDF header.
- [x] Comparison between captures of the same page, line by line.
- [ ] Add more recognition languages on request; each adds about 1 to 3 MB to the package.
