# Agent guide

Guidelines for contributors and coding agents working on Web2Doc.

## Project context

Web2Doc is a TypeScript browser extension using Manifest V3 and Webpack. It exports pages, parts of pages and tables as PDF, PNG, Markdown, JSON, DOCX, XLSX, CSV and MHTML, entirely on the device. The source is grouped by feature; keep new code in the folder of the feature it belongs to:

- `src/popup/` sends actions to the page (`chrome.tabs.sendMessage`) or the background (`chrome.runtime.sendMessage`).
- `src/content/` runs in the page. `ContentRouter` validates requests with `parseContentRequest` and builds files with `PageExporter`; files are saved through the background (`downloadFile`) with a page download as fallback.
- `src/selection/` is the in-page selection: `SelectionPanel` (view), `SelectionController` (steps), `PageSelection` (changes and their temporary application). Any change to the page must be undone on save, back, cancel, Escape, page hide and failure; keep tests for these paths.
- `src/background/` holds the privileged work. `BackgroundRouter` accepts tab actions only from extension pages and selection captures and downloads only from the content script in the top frame of its own tab. `PageCaptureService` uses `chrome.debugger` for PDF, PNG, MHTML and image files; `ExportEngine` runs presets and batches.
- `src/document/` and `src/formats/` are pure: the document model and extractor, and writers for ZIP, XLSX, DOCX and Markdown/JSON without runtime dependencies. Keep them free of extension APIs so they stay unit-testable.
- `src/pages/` are extension pages (settings, batch, OCR, comparison); `src/shared/` is used by every context (messages and validators, files, settings storage, diff, QR, overlay).
- Every message crossing a context boundary has a runtime validator in `src/shared/messages.ts`; add one for any new message.
- Permissions: `activeTab`, `debugger`, `downloads`, `storage`, `contextMenus`, and `tabs` as an optional permission requested only by the batch page. Justify any new permission with the flow that needs it in both READMEs.
- Runtime libraries (`pdf-lib`, `qrcode-generator`, `tesseract.js` and its language data) are bundled; never load code or data from the network.
- The extension is configured to match all URLs, but browser-internal and restricted pages do not allow content scripts.

See [README.md](README.md) for user-facing behavior and setup, [ROADMAP.md](ROADMAP.md) for planned work, and [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Shared agent skills

This file is the shared project guide. Keep common agent instructions here instead of copying them into per-agent configuration files.

The canonical workspace skills live in `.agents/skills/<name>/SKILL.md`. They are installed with the [`skills`](https://skills.sh/) CLI as copied files, and `skills-lock.json` records their sources; run `npx skills update -p` to refresh them, and install new ones with `npx skills add <owner/repo> --skill <name> -a codex --copy -y` so they land in the same directory. Keep their files in this single directory; do not create per-agent copies or compatibility links. Agents that support the shared Agent Skills convention can discover them here. Skills are specialized references, not extra always-on instructions. Load a skill only when its task-specific guidance is useful.

| Skill | Use for |
|---|---|
| `chrome-extension` | Manifest V3, extension APIs, popup/content code, and extension messaging. This is the primary skill for this project. |
| `typescript-patterns` | TypeScript or JavaScript type design and language-level patterns not specific to browser extensions. |
| `typescript-advanced-types` | Advanced TypeScript type-level programming and complex type transformations. |
| `webapp-testing` | Browser-driven testing, Playwright, screenshots, and debugging a running UI. |
| `impeccable` | General UI design or improvement. Prefer this as the single design skill for an interface task. |
| `frontend-design` | A distinct visual direction or a substantial, intentionally styled UI redesign. Use instead of `impeccable` when that is the main goal. |
| `web-design-guidelines` | An explicit UI, UX, or accessibility compliance review. Use for an audit, not alongside the design skills by default. |
| `xlsx` | Creating, reading, or checking spreadsheet files, such as opening an exported CSV the way a spreadsheet application would, or planning a real `.xlsx` export. |
| `pdf` | Reading or inspecting PDF files, such as checking pages, text, links, and the outline of a generated page PDF. |
| `docx` | Creating, reading, or editing Word documents. Only needed if a task involves `.docx` files. |
| `find-skills` | Finding and installing another skill when none of the ones above fits the task. |

The three design skills overlap. Do not load all of them for one task: choose `impeccable` for general interface work, `frontend-design` for a visual redesign, or `web-design-guidelines` for a standards-focused review. Combine skills only when the task has separate needs they each address.

## Development

- Keep application code, identifiers, and comments in English. Keep the two README files synchronized when user-facing behavior or setup changes.
- Preserve the separation between the popup, the content router, the selection feature, the format writers and the background capture services unless a change requires a different design.
- Run `npm test`, `npm run typecheck`, and `npm run build` to verify changes, and `npm run test:browser` (after the build) when a change affects what users see or the files they get.
- Update the roadmap or changelog when a change materially affects project behavior or delivery.
