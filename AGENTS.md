# Agent guide

Guidelines for contributors and coding agents working on Web2Doc.

## Project context

Web2Doc is a TypeScript browser extension using Manifest V3 and Webpack. Its popup sends CSV actions to a content script, where `ExportController` routes them to the CSV service, and PDF actions to a background service worker, where `PagePDFService` renders the tab with `chrome.debugger` and `Page.printToPDF`.

- Table export currently downloads CSV; do not describe it as `.xlsx` export unless that capability is implemented.
- The PDF action generates and downloads a PDF of the page with screen styles, images, and links; it does not open the print dialog. It requires the `debugger` and `downloads` permissions.
- The extension is configured to match all URLs, but browser-internal and restricted pages do not allow content scripts.

See [README.md](README.md) for user-facing behavior and setup, [ROADMAP.md](ROADMAP.md) for planned work, and [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Shared agent skills

This file is the shared project guide. Keep common agent instructions here instead of copying them into per-agent configuration files.

The canonical workspace skills live in `.agents/skills/<name>/SKILL.md`. Keep their files in this single directory; do not create per-agent copies or compatibility links. Agents that support the shared Agent Skills convention can discover them here. Skills are specialized references, not extra always-on instructions. Load a skill only when its task-specific guidance is useful.

| Skill | Use for |
|---|---|
| `chrome-extension` | Manifest V3, extension APIs, popup/content code, and extension messaging. This is the primary skill for this project. |
| `typescript-patterns` | TypeScript or JavaScript type design and language-level patterns not specific to browser extensions. |
| `typescript-advanced-types` | Advanced TypeScript type-level programming and complex type transformations. |
| `webapp-testing` | Browser-driven testing, Playwright, screenshots, and debugging a running UI. |
| `impeccable` | General UI design or improvement. Prefer this as the single design skill for an interface task. |
| `frontend-design` | A distinct visual direction or a substantial, intentionally styled UI redesign. Use instead of `impeccable` when that is the main goal. |
| `web-design-guidelines` | An explicit UI, UX, or accessibility compliance review. Use for an audit, not alongside the design skills by default. |

The three design skills overlap. Do not load all of them for one task: choose `impeccable` for general interface work, `frontend-design` for a visual redesign, or `web-design-guidelines` for a standards-focused review. Combine skills only when the task has separate needs they each address.

## Development

- Keep application code, identifiers, and comments in English. Keep the two README files synchronized when user-facing behavior or setup changes.
- Preserve the existing separation between popup messaging, `ExportController`, and export services unless a change requires a different design.
- Run `npm test`, `npm run typecheck`, and `npm run build` to verify changes.
- Update the roadmap or changelog when a change materially affects project behavior or delivery.
