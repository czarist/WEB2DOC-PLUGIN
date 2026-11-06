// The in-page tools for saving part of the page: outlines for the element under the pointer
// or keyboard, the selection and every change made to it, and a small panel with the steps.
// Everything is drawn in a closed shadow root (see PageOverlay); while the tools are open,
// clicks on the page choose elements instead of activating links or buttons.

import type { PageRect } from "../shared/messages";
import { PageOverlay, placeBox } from "../shared/PageOverlay";
import type { MarkKind, Tool } from "./PageSelection";
import { describeElement } from "./PageSelection";
import type { Notice, SaveFormat, SelectionController, SelectionSnapshot, SelectionStep, SelectionView } from "./SelectionController";

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }

.box {
  position: absolute;
  display: none;
  border-radius: 3px;
  pointer-events: none;
}
.hover { outline: 2px dashed #1f5bd8; outline-offset: 1px; background: rgba(31, 91, 216, 0.08); }
.hover.keyboard { outline-style: solid; outline-width: 3px; }
.hover.remove { outline-color: #17794a; background: rgba(23, 121, 74, 0.1); }
.hover.exclude, .hover.redact { outline-color: #c4320a; background: rgba(196, 50, 10, 0.1); }
.target { outline: 2px solid #1f5bd8; outline-offset: 2px; }
.mark-exclude { outline: 2px solid #c4320a; outline-offset: -1px; background: rgba(196, 50, 10, 0.22); }
.mark-redact { background: rgba(17, 17, 17, 0.82); outline: 2px solid #111; }
.mark-highlight { background: rgba(255, 221, 51, 0.35); outline: 2px solid #c9a400; }
.mark-arrow { outline: 3px solid #e5484d; outline-offset: 3px; }
.mark-break { border-top: 3px dashed #7c3aed; border-radius: 0; }
.mark-comment { outline: 2px dotted #b08900; outline-offset: 2px; }
.mark-moving { outline: 3px solid #0e7490; outline-offset: 2px; background: rgba(14, 116, 144, 0.08); }
.area-box { outline: 2px solid #1f5bd8; background: rgba(31, 91, 216, 0.1); }
.shield { position: absolute; display: none; pointer-events: auto; cursor: pointer; background: transparent; }
.draw-layer { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; background: rgba(15, 23, 42, 0.06); }
.tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 4px);
  max-width: 320px;
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  background: #1f5bd8;
  color: #ffffff;
  font: 600 11px/16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.box.inside .tag { top: 4px; bottom: auto; left: 4px; }
/* The pointer label sits below the element so it never covers the labels of its changes. */
.hover .tag { top: calc(100% + 4px); bottom: auto; }
.hover.inside .tag { top: calc(100% + 4px); left: -2px; }
.mark-break .tag { bottom: auto; top: 4px; }
.hover.exclude .tag, .hover.redact .tag, .mark-exclude .tag { background: #c4320a; }
.hover.remove .tag { background: #17794a; }
.mark-redact .tag { background: #111; }
.mark-highlight .tag, .mark-comment .tag { background: #8a6d00; }
.mark-arrow .tag { background: #c42b31; }
.mark-break .tag { background: #7c3aed; }
.mark-moving .tag { background: #0e7490; }

.panel, .toast {
  --bg: #ffffff;
  --surface: #f2f4f7;
  --surface-active: #e8ebf0;
  --text: #16181d;
  --text-muted: #5b6270;
  --border: #e3e6eb;
  --accent: #1f5bd8;
  --accent-soft: #e8effc;
  --success: #17794a;
  --success-soft: #e6f4ec;
  --error: #b42318;
  --error-soft: #fdecea;
  position: fixed;
  right: 16px;
  bottom: 16px;
  pointer-events: auto;
  color: var(--text);
  background: var(--bg);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12), 0 8px 28px rgba(15, 23, 42, 0.22);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  .panel, .toast {
    --bg: #1d1f24;
    --surface: #282b31;
    --surface-active: #30343b;
    --text: #eceef2;
    --text-muted: #a3a9b5;
    --border: #33363d;
    --accent: #8cb0ff;
    --accent-soft: #263552;
    --success: #6fd69c;
    --success-soft: #1d3a2b;
    --error: #ff9c90;
    --error-soft: #48231f;
    color-scheme: dark;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 28px rgba(0, 0, 0, 0.5);
  }
}
.panel { width: 328px; max-height: calc(100vh - 32px); overflow-y: auto; overscroll-behavior: contain; padding: 12px; }
.panel[data-side="left"] { right: auto; left: 16px; }
::selection { background: var(--accent-soft); color: var(--text); }
[hidden] { display: none !important; }

.head { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -0.01em; outline: none; }
.instructions { margin: 0 0 10px; color: var(--text-muted); font-size: 12px; }

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  transition: background-color 120ms ease-out;
}
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { cursor: default; opacity: 0.5; }
.icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
}
.icon:hover { background: var(--surface); color: var(--text); }
.icon svg, .tool svg { width: 16px; height: 16px; }
.secondary, .primary, .text { height: 30px; padding: 0 10px; font-weight: 600; }
.secondary { background: var(--surface); }
.secondary:hover:not(:disabled) { background: var(--surface-active); }
.text { padding: 0 6px; background: transparent; color: var(--accent); }
.text:hover:not(:disabled) { background: var(--accent-soft); }
.primary { background: var(--accent); color: var(--bg); }
.primary:hover:not(:disabled) { filter: brightness(1.08); }
.row { display: flex; gap: 6px; margin-top: 6px; }
.row > button { flex: 1; }

.selected {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--accent-soft);
}
.selected-name { flex: 1; min-width: 0; overflow: hidden; color: var(--accent); font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.selected-size { color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }

.tools {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-top: 10px;
  padding: 3px;
  border-radius: 10px;
  background: var(--surface);
}
.tool {
  display: grid;
  place-items: center;
  height: 32px;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
}
.tool:hover { background: var(--surface-active); color: var(--text); }
.tool[aria-pressed="true"] { background: var(--bg); color: var(--accent); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18); }
.tool-hint { margin: 6px 0 0; font-size: 12px; color: var(--text-muted); }
.tool-hint strong { color: var(--text); font-weight: 600; }

.editor { margin-top: 8px; padding: 8px; border-radius: 8px; background: var(--surface); }
.editor-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
textarea {
  display: block;
  width: 100%;
  min-height: 60px;
  padding: 6px 8px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  caret-color: var(--accent);
}
.changes {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 30px;
  margin: 8px 0 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.change-count { flex: 1; color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.field { display: block; margin-top: 8px; }
.field > span { display: block; margin-bottom: 3px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.with-suffix { display: flex; align-items: center; gap: 6px; }
.with-suffix input[type="text"] { flex: 1; min-width: 0; width: auto; }
.suffix { color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
input[type="text"] {
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  caret-color: var(--accent);
}
input[type="text"]:hover, textarea:hover { border-color: var(--text-muted); }
fieldset { margin: 0 0 10px; padding: 0; border: 0; }
legend { padding: 0; margin-bottom: 4px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.formats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.format {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}
.format:has(input:checked) { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.format input { margin: 0; accent-color: var(--accent); }
.format:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.review-file { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; background: var(--surface); overflow-wrap: anywhere; }
.review-file span { display: block; color: var(--text-muted); font-size: 12px; }
.notice { margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--surface); font-size: 12px; }
.notice:empty { display: none; }
.notice[data-kind="error"] { background: var(--error-soft); color: var(--error); }
.notice[data-kind="success"] { background: var(--success-soft); color: var(--success); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.foot-start { display: flex; align-items: center; gap: 4px; }
.hint { color: var(--text-muted); font-size: 12px; }
kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: inherit; font-size: 11px; font-weight: 600; }
.toast { max-width: 320px; padding: 10px 14px; background: var(--success-soft); color: var(--success); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

const svg = (body: string, extra = ""): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

const ICONS: Record<Tool | "close" | "dock", string> = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  dock: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>'),
  exclude: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>'),
  highlight: svg('<path d="M4.5 19.5h7"/><path d="M14.5 4.5l5 5-7.5 7.5H7v-5z"/>'),
  arrow: svg('<path d="M4 12h15M14 7l5 5-5 5"/>'),
  comment: svg('<path d="M4.5 5.5h15v10H10l-4 3.5v-3.5H4.5z"/>'),
  redact: svg('<rect x="3.5" y="8" width="17" height="8" rx="1.5" fill="currentColor"/>'),
  break: svg('<path d="M6.5 3.5v5h11v-5M6.5 20.5v-5h11v5"/><path d="M3 12h2.5M9 12h2M13 12h2M18.5 12H21"/>'),
  move: svg('<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>')
};

const TOOLS: Array<{ tool: Tool; label: string; hint: string }> = [
  { tool: "exclude", label: "Exclude", hint: "Click a part to leave it out. Click it again to bring it back." },
  { tool: "highlight", label: "Highlight", hint: "Click a part to highlight it. Click it again to remove the highlight." },
  { tool: "arrow", label: "Arrow", hint: "Click a part to point an arrow at it." },
  { tool: "comment", label: "Comment", hint: "Click a part to add a comment below it." },
  { tool: "redact", label: "Redact", hint: "Click a part to black it out. Its text, link addresses and image descriptions are removed from the saved file." },
  { tool: "break", label: "Page break", hint: "Click a part to start a new PDF page before it." },
  { tool: "move", label: "Move", hint: "Click a part, then move it up or down." }
];

const FORMATS: Array<{ format: SaveFormat; label: string }> = [
  { format: "pdf", label: "PDF" },
  { format: "png", label: "Image (PNG)" },
  { format: "markdown", label: "Markdown" },
  { format: "json", label: "JSON" },
  { format: "docx", label: "Word (DOCX)" },
  { format: "ocr", label: "Text (OCR)" }
];

const MARK_LABELS: Record<MarkKind, string> = {
  exclude: "Excluded", highlight: "Highlighted", arrow: "Arrow", redact: "Redacted", break: "Page break"
};

const PANEL_HTML = `
<div class="head">
  <h2 id="w2d-title" tabindex="-1">Save part of the page</h2>
  <button class="icon" type="button" data-command="dock">${ICONS.dock}</button>
  <button class="icon" type="button" data-command="cancel" aria-label="Cancel and close" title="Cancel and close">${ICONS.close}</button>
</div>
<p class="instructions" id="w2d-instructions" aria-live="polite"></p>
<div class="row" data-steps="picking">
  <button class="secondary" type="button" data-command="main">Use main content</button>
  <button class="secondary" type="button" data-command="area">Draw an area</button>
</div>
<div class="row" data-steps="drawing">
  <button class="secondary" type="button" data-command="element">Choose an element instead</button>
</div>
<div data-steps="editing">
  <div class="selected">
    <span class="selected-name" translate="no"></span>
    <span class="selected-size"></span>
  </div>
  <div class="row">
    <button class="secondary" type="button" data-command="expand">Select larger area</button>
    <button class="secondary" type="button" data-command="repick">Choose again</button>
  </div>
  <div class="tools" role="toolbar" aria-label="Editing tools">
    ${TOOLS.map(({ tool, label }) => `<button class="tool" type="button" data-tool="${tool}" aria-pressed="false" aria-label="${label}" title="${label}">${ICONS[tool]}</button>`).join("")}
  </div>
  <p class="tool-hint"><strong class="tool-name"></strong> <span class="tool-text"></span></p>
  <div class="editor" data-part="comment" hidden>
    <label><span class="editor-label"></span><textarea name="comment" rows="3" maxlength="2000"></textarea></label>
    <div class="row">
      <button class="primary" type="button" data-command="save-comment">Save comment</button>
      <button class="secondary" type="button" data-command="close-comment">Cancel</button>
    </div>
  </div>
  <div class="editor" data-part="move" hidden>
    <span class="editor-label move-label" translate="no"></span>
    <div class="row">
      <button class="secondary" type="button" data-command="move-up">Move up</button>
      <button class="secondary" type="button" data-command="move-down">Move down</button>
      <button class="text" type="button" data-command="move-done">Done</button>
    </div>
  </div>
  <div class="changes">
    <span class="change-count"></span>
    <button class="text" type="button" data-command="undo">Undo</button>
    <button class="text" type="button" data-command="restore">Restore all</button>
  </div>
</div>
<div data-steps="area">
  <div class="selected"><span class="selected-name">Area</span><span class="area-size selected-size"></span></div>
</div>
<fieldset data-steps="reviewing area saving">
  <legend>Save as</legend>
  <div class="formats">
    ${FORMATS.map(({ format, label }) => `<label class="format" data-format="${format}"><input type="radio" name="format" value="${format}">${label}</label>`).join("")}
  </div>
</fieldset>
<div data-steps="editing area reviewing">
  <label class="field"><span>Title</span><input type="text" name="title" autocomplete="off"></label>
  <label class="field"><span>File name</span><span class="with-suffix"><input type="text" name="fileName" autocomplete="off" spellcheck="false"><span class="suffix"></span></span></label>
</div>
<p class="review-file" data-steps="saving"><span>File name</span><strong class="review-name" translate="no"></strong></p>
<p class="notice" aria-live="polite"></p>
<div class="foot">
  <span class="foot-start">
    <span class="hint" data-steps="picking drawing editing area"><kbd>Esc</kbd> to cancel</span>
    <button class="secondary" type="button" data-command="back" data-steps="reviewing saving">Back</button>
    <button class="text" type="button" data-command="copy" data-steps="reviewing">Copy Markdown</button>
  </span>
  <button class="primary" type="button" data-command="review" data-steps="editing">Review</button>
  <button class="primary" type="button" data-command="save" data-steps="reviewing area saving">Save</button>
</div>`;

const INSTRUCTIONS: Record<SelectionStep, string> = {
  picking: "Click the part of the page you want to save, or use the arrow keys and press Enter. Links and buttons will not respond until you finish.",
  drawing: "Drag over the page to draw the area you want to save.",
  editing: "Choose a tool, then click inside the blue outline. Arrow keys and Enter work too.",
  area: "Choose how to save the area you drew.",
  reviewing: "The page now shows only what will be saved. Scroll to check it, choose a format, then save.",
  saving: "Creating the file…"
};

const FORMAT_SAVE_LABELS: Record<SaveFormat, string> = {
  pdf: "Save PDF", png: "Save image", markdown: "Save Markdown", json: "Save JSON", docx: "Save Word file", ocr: "Recognize text"
};

// Page events that would activate links, buttons or text selection while choosing.
const BLOCKED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick"] as const;

// A second click right after a step change (a double click) must not save immediately.
const DOUBLE_CLICK_GUARD_MS = 500;

const ARROW_DIRECTIONS: Record<string, "next" | "previous" | "parent" | "child"> = {
  ArrowDown: "next", ArrowUp: "previous", ArrowLeft: "parent", ArrowRight: "child"
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString()} ${many}`;
}

function changeSummary(snapshot: SelectionSnapshot): string {
  const { marks } = snapshot;
  const parts = [
    marks.exclude.length ? `${marks.exclude.length} excluded` : "",
    marks.highlight.length ? plural(marks.highlight.length, "highlight", "highlights") : "",
    marks.arrow.length ? plural(marks.arrow.length, "arrow", "arrows") : "",
    snapshot.comments.size ? plural(snapshot.comments.size, "comment", "comments") : "",
    marks.redact.length ? `${marks.redact.length} redacted` : "",
    marks.break.length ? plural(marks.break.length, "page break", "page breaks") : "",
    snapshot.reordered ? "reordered" : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No changes yet";
}

function isTextField(target: EventTarget | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === "text")
    || target.closest("[contenteditable='true'], [contenteditable='']") !== null;
}

export class SelectionPanel implements SelectionView {
  private readonly overlay = new PageOverlay("web2doc-selection", STYLE, () => this.layout());
  private controller: SelectionController | undefined;
  private snapshot: SelectionSnapshot | undefined;
  private panel: HTMLElement | undefined;
  private hoverBox: HTMLElement | undefined;
  private targetBox: HTMLElement | undefined;
  private areaBox: HTMLElement | undefined;
  private drawLayer: HTMLElement | undefined;
  private markBoxes: HTMLElement[] = [];
  private shields = new Map<HTMLIFrameElement, HTMLElement>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private listening = false;
  private stepChangedAt = 0;
  private drawStart: { x: number; y: number } | null = null;

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.controller || this.fromOverlay(event)) return;
    this.controller.hover(this.pageElement(event));
  };

  private readonly onPageEvent = (event: Event): void => {
    const controller = this.controller;
    if (!controller?.active || this.fromOverlay(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== "click" || !event.isTrusted) return;
    const element = this.pageElement(event);
    if (element) controller.click(element);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const controller = this.controller;
    if (!controller?.active) return;
    if (controller.handleKey(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const origin = event.composedPath()[0];
    if (isTextField(origin) || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = ARROW_DIRECTIONS[event.key];
    const step = controller.currentStep;
    if (direction && (step === "picking" || step === "editing")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      controller.navigate(direction);
      return;
    }
    // Enter and Space act on the outlined element unless a control has focus.
    const onControl = origin instanceof Element && origin.closest("button, input, a, select, textarea, [role='button']") !== null;
    if ((event.key === "Enter" || event.key === " ") && !onControl && (step === "picking" || step === "editing")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      controller.activate();
    }
  };

  private readonly onPageHide = (): void => {
    this.controller?.cancel();
  };

  connect(controller: SelectionController): void {
    this.controller = controller;
  }

  render(snapshot: SelectionSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    const firstRender = !this.panel;
    this.mount();
    const panel = this.panel;
    if (!panel) return;
    if (previous?.step !== snapshot.step) this.stepChangedAt = performance.now();

    panel.querySelectorAll<HTMLElement>("[data-steps]").forEach((element) => {
      element.hidden = !(element.dataset["steps"] ?? "").split(" ").includes(snapshot.step);
    });
    this.text(".instructions", INSTRUCTIONS[snapshot.step]);
    this.text("h2", snapshot.step === "drawing" || snapshot.step === "area" ? "Save an area of the page" : "Save part of the page");

    const target = snapshot.target;
    if (target) {
      const rect = target.getBoundingClientRect();
      this.text(".selected-name", describeElement(target));
      this.text(".selected-size", `${Math.round(rect.width).toLocaleString()} × ${Math.round(rect.height).toLocaleString()} px`);
    }
    if (snapshot.area) this.text(".area-size", `${snapshot.area.width.toLocaleString()} × ${snapshot.area.height.toLocaleString()} px`);

    // Tools
    panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset["tool"] === snapshot.tool));
    });
    const tool = TOOLS.find((item) => item.tool === snapshot.tool);
    this.text(".tool-name", tool ? `${tool.label}:` : "");
    this.text(".tool-text", tool?.hint ?? "");

    const commentEditor = panel.querySelector<HTMLElement>('[data-part="comment"]');
    if (commentEditor) {
      const wasHidden = commentEditor.hidden;
      commentEditor.hidden = !snapshot.commenting;
      if (snapshot.commenting) {
        this.text(".editor-label", `Comment on ${describeElement(snapshot.commenting.element)}`);
        const area = commentEditor.querySelector("textarea");
        if (area && wasHidden) {
          area.value = snapshot.commenting.text;
          area.focus();
        }
      }
    }
    const moveEditor = panel.querySelector<HTMLElement>('[data-part="move"]');
    if (moveEditor) {
      moveEditor.hidden = !snapshot.moving;
      if (snapshot.moving) {
        this.text(".move-label", `Moving ${describeElement(snapshot.moving.element)}`);
        this.button("move-up").disabled = !snapshot.moving.canMoveUp;
        this.button("move-down").disabled = !snapshot.moving.canMoveDown;
      }
    }

    this.text(".change-count", changeSummary(snapshot));
    this.button("undo").disabled = !snapshot.canUndo;
    this.button("restore").disabled = !snapshot.hasChanges;
    this.button("expand").disabled = !snapshot.canExpand;

    // Formats
    panel.querySelectorAll<HTMLElement>("[data-format]").forEach((label) => {
      const format = label.dataset["format"] as SaveFormat;
      label.hidden = !snapshot.formats.includes(format);
      const input = label.querySelector("input");
      if (input) input.checked = format === snapshot.format;
    });

    this.syncInput("title", snapshot.title);
    this.syncInput("fileName", snapshot.fileBase);
    this.text(".suffix", `.${snapshot.fileName.split(".").pop() ?? ""}`);
    this.text(".review-name", snapshot.fileName);

    const saving = snapshot.step === "saving";
    this.button("save").disabled = saving;
    this.button("back").disabled = saving;
    this.button("save").textContent = saving ? "Saving…" : FORMAT_SAVE_LABELS[snapshot.format];
    this.button("cancel").disabled = saving;
    panel.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((input) => { input.disabled = saving; });

    const notice = panel.querySelector<HTMLElement>(".notice");
    if (notice) {
      notice.dataset["kind"] = snapshot.notice?.kind ?? "";
      notice.setAttribute("role", snapshot.notice?.kind === "error" ? "alert" : "status");
      notice.textContent = snapshot.notice?.text ?? "";
    }

    if (firstRender) panel.querySelector<HTMLElement>("h2")?.focus();
    if (previous?.step === "editing" && snapshot.step === "reviewing") this.button("save").focus();
    if (previous?.step === "reviewing" && snapshot.step === "editing") this.button("review").focus();
    if (previous?.commenting && !snapshot.commenting && snapshot.step === "editing") panel.querySelector<HTMLElement>('[data-tool="comment"]')?.focus();
    this.layout();
  }

  setCaptureHidden(hidden: boolean): void {
    this.overlay.setHidden(hidden);
  }

  showReview(): void {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  reveal(element: Element): void {
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) element.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  close(notice: Notice | null): void {
    this.stopListening();
    this.snapshot = undefined;
    this.panel = undefined;
    this.hoverBox = undefined;
    this.targetBox = undefined;
    this.areaBox = undefined;
    this.drawLayer = undefined;
    this.markBoxes = [];
    this.shields.clear();
    this.overlay.remove();
    if (notice) this.showToast(notice);
  }

  private mount(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
      this.overlay.remove();
    }
    if (this.panel) return;
    const root = this.overlay.root;
    this.hoverBox = this.box("hover");
    this.targetBox = this.box("target");
    this.areaBox = this.box("area-box");

    const layer = document.createElement("div");
    layer.className = "draw-layer";
    layer.hidden = true;
    layer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      layer.setPointerCapture(event.pointerId);
      this.drawStart = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
    });
    layer.addEventListener("pointermove", (event) => {
      if (!this.drawStart || !this.areaBox) return;
      this.placeRect(this.areaBox, this.rectFrom(this.drawStart, event), "");
    });
    layer.addEventListener("pointerup", (event) => {
      if (!this.drawStart) return;
      const rect = this.rectFrom(this.drawStart, event);
      this.drawStart = null;
      this.controller?.areaDrawn(rect);
    });
    root.append(layer);
    this.drawLayer = layer;

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.dataset["side"] = "right";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "w2d-title");
    panel.setAttribute("aria-describedby", "w2d-instructions");
    panel.innerHTML = PANEL_HTML;
    root.append(panel);
    this.panel = panel;
    this.updateDockLabel();

    panel.addEventListener("click", (event) => {
      const element = event.target as Element | null;
      const toolButton = element?.closest<HTMLButtonElement>("button[data-tool]");
      if (toolButton) {
        this.controller?.setTool(toolButton.dataset["tool"] as Tool);
        return;
      }
      const button = element?.closest<HTMLButtonElement>("button[data-command]");
      if (button && !button.disabled) this.run(button.dataset["command"] ?? "");
    });
    panel.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.name === "title") this.controller?.setTitle(input.value);
      if (input.name === "fileName") this.controller?.setFileName(input.value);
    });
    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.name === "format" && input.checked) this.controller?.setFormat(input.value as SaveFormat);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "text") {
        event.preventDefault();
        this.run(this.snapshot?.step === "editing" ? "review" : "save");
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && event.target instanceof HTMLTextAreaElement) {
        event.preventDefault();
        this.run("save-comment");
      }
    });
    this.startListening();
  }

  private run(command: string): void {
    const controller = this.controller;
    if (!controller) return;
    switch (command) {
      case "cancel": controller.cancel(); break;
      case "main": controller.useMainContent(); break;
      case "area": controller.setMode("area"); break;
      case "element": controller.setMode("element"); break;
      case "expand": controller.expand(); break;
      case "repick": controller.repick(); break;
      case "undo": controller.undo(); break;
      case "restore": controller.restoreAll(); break;
      case "review": controller.review(); break;
      case "back": controller.back(); break;
      case "copy": void controller.copyMarkdown(); break;
      case "save-comment": {
        const area = this.panel?.querySelector("textarea");
        controller.saveComment(area?.value ?? "");
        break;
      }
      case "close-comment": controller.closeComment(); break;
      case "move-up": controller.moveBlock(-1); break;
      case "move-down": controller.moveBlock(1); break;
      case "move-done": controller.doneMoving(); break;
      case "save":
        if (performance.now() - this.stepChangedAt >= DOUBLE_CLICK_GUARD_MS) void controller.save();
        break;
      case "dock":
        if (this.panel) {
          this.panel.dataset["side"] = this.panel.dataset["side"] === "left" ? "right" : "left";
          this.updateDockLabel();
        }
        break;
    }
  }

  private updateDockLabel(): void {
    const dock = this.panel?.querySelector<HTMLButtonElement>('[data-command="dock"]');
    if (!dock || !this.panel) return;
    const label = this.panel.dataset["side"] === "left" ? "Move panel to the right" : "Move panel to the left";
    dock.setAttribute("aria-label", label);
    dock.title = label;
  }

  private layout(): void {
    const snapshot = this.snapshot;
    if (!snapshot || !this.hoverBox || !this.targetBox || !this.areaBox) return;
    const choosing = snapshot.step === "picking" || snapshot.step === "editing";
    const editing = snapshot.step === "editing";

    if (this.drawLayer) this.drawLayer.hidden = snapshot.step !== "drawing";
    if (snapshot.step === "area" && snapshot.area) this.placeRect(this.areaBox, snapshot.area, "Area");
    else if (snapshot.step !== "drawing" || !this.drawStart) this.areaBox.style.display = "none";

    this.place(this.targetBox, choosing ? snapshot.target : null, snapshot.target ? `Selected · ${describeElement(snapshot.target)}` : "");

    // One box per changed element, labeled with every change applied to it.
    const byElement = new Map<Element, { kinds: string[]; labels: string[] }>();
    const add = (element: Element, kind: string, label: string): void => {
      const entry = byElement.get(element) ?? { kinds: [], labels: [] };
      entry.kinds.push(kind);
      entry.labels.push(label);
      byElement.set(element, entry);
    };
    if (editing) {
      for (const [kind, elements] of Object.entries(snapshot.marks) as Array<[MarkKind, readonly Element[]]>) {
        for (const element of elements) add(element, `mark-${kind}`, MARK_LABELS[kind]);
      }
      for (const element of snapshot.comments.keys()) add(element, "mark-comment", "Comment");
      if (snapshot.moving) add(snapshot.moving.element, "mark-moving", "Moving");
    }
    const marked: Array<[Element, string, string]> = [...byElement].map(([element, entry]) => [element, entry.kinds.join(" "), entry.labels.join(" · ")]);
    while (this.markBoxes.length < marked.length) this.markBoxes.push(this.box("mark"));
    this.markBoxes.forEach((box, index) => {
      const entry = marked[index];
      box.className = `box ${entry?.[1] ?? ""}`;
      this.place(box, entry?.[0] ?? null, entry?.[2] ?? "");
    });

    const hovered = choosing ? snapshot.hovered : null;
    const { label, mode } = this.hoverAction(snapshot, hovered);
    this.hoverBox.className = `box hover${mode ? ` ${mode}` : ""}${snapshot.keyboard ? " keyboard" : ""}`;
    this.place(this.hoverBox, label ? hovered : null, label, snapshot.step === "picking");

    this.layoutShields(choosing);
  }

  /** What clicking the hovered element would do, shown on its outline. */
  private hoverAction(snapshot: SelectionSnapshot, hovered: Element | null): { label: string; mode: string } {
    if (!hovered) return { label: "", mode: "" };
    const name = describeElement(hovered);
    if (snapshot.step === "picking") return { label: name, mode: "" };
    const target = snapshot.target;
    if (!target || !(hovered === target || target.contains(hovered))) return { label: "", mode: "" };
    const covers = (kind: MarkKind): boolean => snapshot.marks[kind].some((element) => element === hovered || element.contains(hovered));
    switch (snapshot.tool) {
      case "exclude":
        if (hovered === target) return { label: "", mode: "" };
        return covers("exclude") ? { label: "Click to bring back", mode: "remove" } : { label: `Exclude ${name}`, mode: "exclude" };
      case "redact":
        return covers("redact") ? { label: "Click to remove the redaction", mode: "remove" } : { label: `Redact ${name}`, mode: "redact" };
      case "highlight":
        return snapshot.marks.highlight.includes(hovered) ? { label: "Click to remove the highlight", mode: "remove" } : { label: `Highlight ${name}`, mode: "" };
      case "arrow":
        return snapshot.marks.arrow.includes(hovered) ? { label: "Click to remove the arrow", mode: "remove" } : { label: `Point at ${name}`, mode: "" };
      case "break":
        if (hovered === target) return { label: "", mode: "" };
        return snapshot.marks.break.includes(hovered) ? { label: "Click to remove the page break", mode: "remove" } : { label: `New page before ${name}`, mode: "" };
      case "comment":
        return { label: snapshot.comments.has(hovered) ? "Click to edit the comment" : `Comment on ${name}`, mode: "" };
      case "move":
        return hovered === target ? { label: "", mode: "" } : { label: `Move ${name}`, mode: "" };
    }
  }

  /** Transparent covers over frames: events inside a frame never reach this page. */
  private layoutShields(active: boolean): void {
    const frames = active ? Array.from(document.querySelectorAll("iframe")) : [];
    for (const [frame, shield] of this.shields) {
      if (!frames.includes(frame)) {
        shield.remove();
        this.shields.delete(frame);
      }
    }
    for (const frame of frames) {
      let shield = this.shields.get(frame);
      if (!shield) {
        shield = document.createElement("div");
        shield.className = "shield";
        shield.addEventListener("pointermove", () => this.controller?.hover(frame));
        shield.addEventListener("click", (event) => {
          event.preventDefault();
          if (event.isTrusted) this.controller?.click(frame);
        });
        if (this.panel) this.overlay.root.insertBefore(shield, this.panel);
        this.shields.set(frame, shield);
      }
      placeBox(shield, frame);
    }
  }

  private place(box: HTMLElement, element: Element | null | undefined, label: string, withSize = false): void {
    const rect = placeBox(box, element);
    const tag = box.firstElementChild as HTMLElement | null;
    if (!rect || !tag) return;
    tag.textContent = withSize ? `${label} · ${Math.round(rect.width)} × ${Math.round(rect.height)}` : label;
    tag.hidden = label === "";
    // Keep the label on screen when the element starts at the top of the page.
    box.classList.toggle("inside", rect.top + window.scrollY < 24);
  }

  private placeRect(box: HTMLElement, rect: PageRect, label: string): void {
    box.style.display = "block";
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    const tag = box.firstElementChild as HTMLElement | null;
    if (tag) {
      tag.textContent = label ? `${label} · ${rect.width} × ${rect.height}` : `${rect.width} × ${rect.height}`;
      tag.hidden = false;
    }
    box.classList.toggle("inside", rect.y < 24);
  }

  private rectFrom(start: { x: number; y: number }, event: PointerEvent): PageRect {
    const x = event.clientX + window.scrollX;
    const y = event.clientY + window.scrollY;
    return {
      x: Math.round(Math.min(start.x, x)),
      y: Math.round(Math.min(start.y, y)),
      width: Math.round(Math.abs(x - start.x)),
      height: Math.round(Math.abs(y - start.y))
    };
  }

  private box(kind: string): HTMLElement {
    const box = document.createElement("div");
    box.className = `box ${kind}`;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.setAttribute("translate", "no");
    box.append(tag);
    // Boxes sit below the panel so the panel always stays clickable.
    if (this.panel) this.overlay.root.insertBefore(box, this.panel);
    else this.overlay.root.append(box);
    return box;
  }

  private text(selector: string, value: string): void {
    const element = this.panel?.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private button(command: string): HTMLButtonElement {
    const button = this.panel?.querySelector<HTMLButtonElement>(`button[data-command="${command}"]`);
    if (!button) throw new Error(`Web2Doc selection panel is missing the ${command} button.`);
    return button;
  }

  private syncInput(name: string, value: string): void {
    const input = this.panel?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    // Never overwrite what the user is typing.
    if (input && input.value !== value && this.overlay.root.activeElement !== input) input.value = value;
  }

  private showToast(notice: Notice): void {
    const toast = document.createElement("p");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = notice.text;
    this.overlay.root.append(toast);
    this.toastTimer = setTimeout(() => {
      this.toastTimer = undefined;
      this.overlay.remove();
    }, 4000);
  }

  private fromOverlay(event: Event): boolean {
    const host = this.overlay.element;
    return host !== undefined && event.composedPath().includes(host);
  }

  /** The deepest page element under the event, including elements in open shadow roots. */
  private pageElement(event: Event): Element | null {
    if (this.fromOverlay(event)) return null;
    const first = event.composedPath().find((node): node is Element => node instanceof Element);
    return first ?? (event.target instanceof Element ? event.target : null);
  }

  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("pointermove", this.onPointerMove, { capture: true, passive: true });
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, this.onPageEvent, true);
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("pagehide", this.onPageHide);
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener("pointermove", this.onPointerMove, true);
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, this.onPageEvent, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("pagehide", this.onPageHide);
  }
}
