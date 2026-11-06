import { cleanFileName, fileName, type FileKind } from "../shared/files";
import { isExportResult, type ExportResult, type ImageCaptureKind, type PageRect, type SelectionImageRequest, type SelectionPDFRequest } from "../shared/messages";
import { PageSelection, nextElement, suggestTitle, type Direction, type MarkKind, type PagePreparation, type Tool } from "./PageSelection";

// Runs the in-page "save part of the page" flow:
//   picking   -> the user clicks (or moves with the arrow keys to) the part to keep
//   drawing   -> alternatively, the user drags a rectangle over the page
//   editing   -> the user excludes, highlights, points at, comments, redacts, adds page
//                breaks or reorders blocks, and adjusts the title and file name
//   area      -> a drawn rectangle is ready to be saved as an image, PDF or text
//   reviewing -> the page shows only what will be saved; the user picks the format
//   saving    -> the file is being created
// The page is changed only while reviewing or saving, and it is restored when the user
// goes back, cancels, saves, or the export fails.

export type SelectionStep = "picking" | "drawing" | "editing" | "area" | "reviewing" | "saving";
export type SaveFormat = "pdf" | "png" | "markdown" | "json" | "docx" | "ocr";
export type DocumentSaveFormat = Extract<SaveFormat, "markdown" | "json" | "docx">;

export const SELECTION_FORMATS: readonly SaveFormat[] = ["pdf", "png", "markdown", "json", "docx", "ocr"];
export const AREA_FORMATS: readonly SaveFormat[] = ["png", "pdf", "ocr"];

const FILE_KINDS: Record<SaveFormat, FileKind> = {
  pdf: "pdf", png: "png", markdown: "markdown", json: "json", docx: "docx", ocr: "png"
};

export interface Notice {
  kind: "info" | "success" | "error";
  text: string;
}

export interface SelectionSnapshot {
  step: SelectionStep;
  tool: Tool;
  target: Element | null;
  hovered: Element | null;
  /** True when the outline follows the keyboard rather than the pointer. */
  keyboard: boolean;
  marks: Readonly<Record<MarkKind, readonly Element[]>>;
  comments: ReadonlyMap<Element, string>;
  /** The element whose comment is being edited. */
  commenting: { element: Element; text: string } | null;
  /** The block being moved, with whether it can move further. */
  moving: { element: Element; canMoveUp: boolean; canMoveDown: boolean } | null;
  reordered: boolean;
  canUndo: boolean;
  canExpand: boolean;
  hasChanges: boolean;
  area: PageRect | null;
  format: SaveFormat;
  formats: readonly SaveFormat[];
  title: string;
  /** File name without extension, as typed. */
  fileBase: string;
  /** The full file name that will be saved. */
  fileName: string;
  notice: Notice | null;
}

export interface SelectionView {
  render(snapshot: SelectionSnapshot): void;
  /** Hides the selection tools so they are not captured. */
  setCaptureHidden(hidden: boolean): void;
  /** Called when the page has been prepared for review. */
  showReview(): void;
  /** Scrolls an element into view, for keyboard navigation. */
  reveal?(element: Element): void;
  /** Removes the selection tools, optionally leaving a short confirmation on the page. */
  close(notice: Notice | null): void;
}

export interface DocumentRequest {
  format: DocumentSaveFormat;
  selection: PageSelection;
  title: string;
  fileName: string;
}

export interface SelectionControllerOptions {
  view: SelectionView;
  document: Document;
  /** Sends a capture request to the background service worker. */
  send(request: SelectionPDFRequest | SelectionImageRequest): Promise<unknown>;
  /** Builds and downloads a Markdown, JSON or Word file of the selection. */
  saveDocument?(request: DocumentRequest): Promise<ExportResult>;
  /** Markdown of the selection, for the clipboard. */
  markdown?(selection: PageSelection, title: string): string;
  copyText?(text: string): Promise<boolean>;
  /** Whether keyboard navigation may stop on an element (rendered and visible). */
  canVisit?(element: Element): boolean;
  /** File name pattern from the preferences; `{title}` by default. */
  fileNamePattern?: () => string;
  /** How long to wait for a capture before restoring the page. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const MAIN_CONTENT_SELECTOR = "main, [role='main'], article";
const MARK_KINDS: readonly MarkKind[] = ["exclude", "highlight", "arrow", "redact", "break"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class SelectionController {
  readonly selection = new PageSelection();
  private step: SelectionStep | null = null;
  private tool: Tool = "exclude";
  private hovered: Element | null = null;
  private keyboard = false;
  private commenting: { element: Element; text: string } | null = null;
  private moving: Element | null = null;
  private area: PageRect | null = null;
  private format: SaveFormat = "pdf";
  private title = "";
  private fileBase = "";
  private fileBaseEdited = false;
  private notice: Notice | null = null;
  private preparation: PagePreparation | undefined;

  constructor(private readonly options: SelectionControllerOptions) {}

  get active(): boolean {
    return this.step !== null;
  }

  get currentStep(): SelectionStep | null {
    return this.step;
  }

  get target(): Element | null {
    return this.selection.target;
  }

  get currentTool(): Tool {
    return this.tool;
  }

  /** Opens the selection tools, or keeps the current session if one is already open. */
  start(mode: "element" | "area" = "element"): ExportResult {
    if (this.step !== null && this.step !== "picking" && this.step !== "drawing") {
      this.render();
      return { success: true, message: "The selection tools are already open on the page." };
    }
    this.reset();
    this.step = mode === "area" ? "drawing" : "picking";
    this.format = mode === "area" ? "png" : "pdf";
    this.render();
    return { success: true, message: mode === "area" ? "Drag over the page to choose an area." : "Click the part of the page you want to save." };
  }

  private reset(): void {
    this.releasePage();
    this.selection.clear();
    this.tool = "exclude";
    this.hovered = null;
    this.keyboard = false;
    this.commenting = null;
    this.moving = null;
    this.area = null;
    this.title = "";
    this.fileBase = "";
    this.fileBaseEdited = false;
    this.notice = null;
  }

  hover(element: Element | null): void {
    if (this.step !== "picking" && this.step !== "editing") return;
    if (this.hovered === element && !this.keyboard) return;
    this.hovered = element;
    this.keyboard = false;
    this.render();
  }

  /** A click on the page: chooses the selection, or applies the current tool inside it. */
  click(element: Element): void {
    if (this.step === "picking") {
      this.choose(element);
      return;
    }
    if (this.step !== "editing") return;
    const target = this.selection.target;
    if (!target) return;
    this.notice = null;

    if (this.tool === "comment") {
      if (target !== element && !target.contains(element) && this.selection.blockFor(element) === null) {
        this.notice = { kind: "info", text: "That is outside the selected area. Use Choose again to select something else." };
      } else {
        this.commenting = { element, text: this.selection.comments.get(element) ?? "" };
      }
    } else if (this.tool === "move") {
      const block = this.selection.blockFor(element);
      this.moving = block;
      if (!block) this.notice = { kind: "info", text: "Click a part inside the selection to move it up or down." };
    } else {
      const result = this.selection.toggle(this.tool, element);
      if (result === "ignored") {
        this.notice = element === target
          ? { kind: "info", text: "Click a part inside the outline. To change the whole selection, use Choose again." }
          : { kind: "info", text: "That is outside the selected area. Use Choose again to select something else." };
      }
    }
    this.render();
  }

  setTool(tool: Tool): void {
    if (this.step !== "editing" || this.tool === tool) return;
    this.tool = tool;
    this.commenting = null;
    this.moving = null;
    this.notice = null;
    this.render();
  }

  /** Moves the outline with the keyboard. */
  navigate(direction: Direction): void {
    if (this.step !== "picking" && this.step !== "editing") return;
    const canVisit = this.options.canVisit ?? (() => true);
    const bounds = this.step === "editing" ? this.selection.target ?? undefined : undefined;
    const doc = this.options.document;
    let current = this.hovered;
    if (bounds && current && !bounds.contains(current)) current = null;
    let next: Element | null;
    if (!current) {
      const start = bounds ?? doc.querySelector(MAIN_CONTENT_SELECTOR) ?? doc.body;
      next = start ? (bounds ? nextElement(start, "child", canVisit) : start) : null;
    } else {
      next = nextElement(current, direction, canVisit, bounds);
    }
    if (!next) return;
    this.hovered = next;
    this.keyboard = true;
    this.options.view.reveal?.(next);
    this.render();
  }

  /** Enter or Space: acts on the element under the keyboard outline. */
  activate(): void {
    if (this.hovered && (this.step === "picking" || this.step === "editing")) this.click(this.hovered);
  }

  /** Keyboard-friendly alternative to clicking: selects the page's main content. */
  useMainContent(): void {
    if (this.step !== "picking") return;
    const doc = this.options.document;
    const main = doc.querySelector(MAIN_CONTENT_SELECTOR) ?? doc.body;
    if (main) this.choose(main);
  }

  /** Switches between choosing an element and drawing a rectangle. */
  setMode(mode: "element" | "area"): void {
    if (this.step !== "picking" && this.step !== "drawing" && this.step !== "area") return;
    this.area = null;
    this.step = mode === "area" ? "drawing" : "picking";
    this.format = mode === "area" ? "png" : "pdf";
    this.notice = null;
    this.render();
  }

  /** The user finished drawing a rectangle, in page coordinates. */
  areaDrawn(rect: PageRect): void {
    if (this.step !== "drawing") return;
    if (rect.width < 8 || rect.height < 8) {
      this.notice = { kind: "info", text: "Drag a larger area." };
      this.render();
      return;
    }
    this.area = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    this.step = "area";
    this.notice = null;
    if (!this.title) this.title = (this.options.document.title || "Page area").trim().slice(0, 120);
    if (!AREA_FORMATS.includes(this.format)) this.format = "png";
    this.render();
  }

  expand(): void {
    if (this.step !== "editing" || !this.selection.expand()) return;
    this.notice = null;
    this.moving = null;
    this.commenting = null;
    this.refreshTitle();
    this.render();
  }

  repick(): void {
    if (this.step !== "editing") return;
    this.selection.clear();
    this.step = "picking";
    this.hovered = null;
    this.commenting = null;
    this.moving = null;
    this.notice = null;
    this.render();
  }

  undo(): void {
    if (this.step !== "editing" || !this.selection.undo()) return;
    this.notice = null;
    this.commenting = null;
    this.render();
  }

  restoreAll(): void {
    if (this.step !== "editing" || !this.selection.restoreAll()) return;
    this.notice = null;
    this.commenting = null;
    this.moving = null;
    this.render();
  }

  saveComment(text: string): void {
    if (this.step !== "editing" || !this.commenting) return;
    this.selection.setComment(this.commenting.element, text);
    this.commenting = null;
    this.render();
  }

  closeComment(): void {
    if (!this.commenting) return;
    this.commenting = null;
    this.render();
  }

  moveBlock(delta: -1 | 1): void {
    if (this.step !== "editing" || !this.moving) return;
    this.selection.move(this.moving, delta);
    this.render();
  }

  doneMoving(): void {
    if (!this.moving) return;
    this.moving = null;
    this.render();
  }

  setTitle(title: string): void {
    if (this.step !== "editing" && this.step !== "area" && this.step !== "reviewing") return;
    this.title = title;
    if (!this.fileBaseEdited) this.fileBase = cleanFileName(title);
    this.render();
  }

  setFileName(name: string): void {
    if (this.step !== "editing" && this.step !== "area" && this.step !== "reviewing") return;
    const base = name.replace(/\.(pdf|png|md|json|docx)\s*$/i, "");
    this.fileBaseEdited = base.trim().length > 0;
    this.fileBase = this.fileBaseEdited ? base : cleanFileName(this.title);
    this.render();
  }

  setFormat(format: SaveFormat): void {
    const allowed = this.step === "area" ? AREA_FORMATS : SELECTION_FORMATS;
    if ((this.step !== "reviewing" && this.step !== "area" && this.step !== "editing") || !allowed.includes(format)) return;
    this.format = format;
    this.render();
  }

  /** Shows the page as it will be saved. */
  review(): void {
    if (this.step !== "editing") return;
    if (!this.prepare()) return;
    this.step = "reviewing";
    this.hovered = null;
    this.commenting = null;
    this.moving = null;
    this.notice = null;
    this.render();
    this.options.view.showReview();
  }

  /** Leaves the review or the drawn area. */
  back(): void {
    if (this.step === "reviewing") {
      this.releasePage();
      this.step = "editing";
      this.render();
    } else if (this.step === "area") {
      this.setMode("area");
    } else if (this.step === "drawing") {
      this.setMode("element");
    }
  }

  private currentFileName(): string {
    const pattern = this.options.fileNamePattern?.() ?? "{title}";
    // A drawn area is named after the page, with "area" added unless the user typed a name.
    const base = this.fileBaseEdited ? this.fileBase : pattern;
    const context = { title: this.title, url: this.options.document.URL ?? "", ...(this.area && !this.fileBaseEdited ? { label: "area" } : {}) };
    return fileName(base, context, FILE_KINDS[this.format]);
  }

  async copyMarkdown(): Promise<void> {
    if ((this.step !== "editing" && this.step !== "reviewing") || !this.options.markdown || !this.options.copyText) return;
    let text: string;
    try {
      text = this.options.markdown(this.selection, this.title);
    } catch (error) {
      this.notice = { kind: "error", text: `The Markdown could not be created: ${errorMessage(error)}` };
      this.render();
      return;
    }
    const copied = await this.options.copyText(text);
    this.notice = copied
      ? { kind: "success", text: "Markdown copied to the clipboard." }
      : { kind: "error", text: "The browser did not allow copying. Save the Markdown file instead." };
    this.render();
  }

  async save(): Promise<void> {
    const step = this.step;
    if (step !== "editing" && step !== "reviewing" && step !== "area") return;
    const format = this.format;
    const name = this.currentFileName();
    const { view } = this.options;

    if (step !== "area" && (format === "markdown" || format === "json" || format === "docx")) {
      // Documents are built from the user's choices; the page itself is not needed.
      this.releasePage();
      if (!this.options.saveDocument) return;
      this.step = "saving";
      this.notice = { kind: "info", text: "Creating the file…" };
      this.render();
      let result: ExportResult;
      try {
        result = await this.options.saveDocument({ format, selection: this.selection, title: this.title, fileName: name });
      } catch (error) {
        result = { success: false, message: `The file could not be created: ${errorMessage(error)}` };
      }
      this.settle(result, step === "reviewing" ? "editing" : step);
      return;
    }

    if (step !== "area" && !this.preparation && !this.prepare()) return;
    const kind: ImageCaptureKind | null = format === "png" ? "png" : format === "ocr" ? "ocr" : step === "area" && format === "pdf" ? "pdf" : null;
    const request: SelectionPDFRequest | SelectionImageRequest = kind
      ? { action: "captureSelectionImage", kind, fileName: name, ...(step === "area" && this.area ? { rect: this.area } : {}) }
      : { action: "exportSelectionPDF", fileName: name };

    this.step = "saving";
    this.notice = { kind: "info", text: format === "ocr" ? "Capturing the image for text recognition…" : "Creating the file…" };
    this.render();
    view.setCaptureHidden(true);

    let result: ExportResult;
    try {
      const response = await withTimeout(this.options.send(request), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      result = isExportResult(response)
        ? response
        : { success: false, message: "Web2Doc returned an invalid response. Try again." };
    } catch (error) {
      result = errorMessage(error) === "timeout"
        ? { success: false, message: "The capture took too long. The page was restored; try a smaller selection." }
        : { success: false, message: "Web2Doc could not reach the extension. Reload the page and try again." };
    } finally {
      this.releasePage();
      view.setCaptureHidden(false);
    }
    this.settle(result, step === "reviewing" ? "editing" : step);
  }

  private settle(result: ExportResult, stepOnFailure: SelectionStep): void {
    if (result.success) {
      this.finish({ kind: "success", text: result.message });
    } else {
      this.step = stepOnFailure;
      this.notice = { kind: "error", text: result.message };
      this.render();
    }
  }

  /** Closes the tools and undoes every change to the page. Ignored while a capture runs. */
  cancel(): void {
    if (this.step === null || this.step === "saving") return;
    this.finish(null);
  }

  /**
   * Handles a key pressed on the page. Escape first closes an open comment or move, then
   * cancels. Returns true when the key was used.
   */
  handleKey(key: string): boolean {
    if (key !== "Escape" || this.step === null) return false;
    if (this.commenting) {
      this.closeComment();
      return true;
    }
    if (this.moving) {
      this.doneMoving();
      return true;
    }
    this.cancel();
    return true;
  }

  private choose(element: Element): void {
    if (!this.selection.choose(element)) return;
    this.step = "editing";
    this.hovered = null;
    this.keyboard = false;
    this.notice = null;
    this.fileBaseEdited = false;
    this.refreshTitle();
    this.render();
  }

  private refreshTitle(): void {
    const target = this.selection.target;
    if (!target) return;
    this.title = suggestTitle(target, this.options.document.title);
    if (!this.fileBaseEdited) this.fileBase = cleanFileName(this.title);
  }

  private prepare(): boolean {
    try {
      this.preparation = this.selection.prepare(this.options.document, { title: this.title });
      return true;
    } catch (error) {
      this.preparation = undefined;
      this.notice = { kind: "error", text: `The page could not be prepared: ${errorMessage(error)}` };
      this.render();
      return false;
    }
  }

  private releasePage(): void {
    this.preparation?.restore();
    this.preparation = undefined;
  }

  private finish(notice: Notice | null): void {
    this.reset();
    this.step = null;
    this.options.view.close(notice);
  }

  private render(): void {
    if (this.step === null) return;
    const marks = Object.fromEntries(MARK_KINDS.map((kind) => [kind, this.selection.elementsWith(kind)])) as Record<MarkKind, Element[]>;
    const order = this.moving ? this.selection.orderedChildren() : [];
    const index = this.moving ? order.indexOf(this.moving) : -1;
    this.options.view.render({
      step: this.step,
      tool: this.tool,
      target: this.selection.target,
      hovered: this.hovered,
      keyboard: this.keyboard,
      marks,
      comments: this.selection.comments,
      commenting: this.commenting,
      moving: this.moving ? { element: this.moving, canMoveUp: index > 0, canMoveDown: index >= 0 && index < order.length - 1 } : null,
      reordered: this.selection.reordered,
      canUndo: this.selection.canUndo,
      canExpand: this.selection.canExpand,
      hasChanges: this.selection.hasChanges,
      area: this.area,
      format: this.format,
      formats: this.step === "area" || this.step === "drawing" ? AREA_FORMATS : SELECTION_FORMATS,
      title: this.title,
      fileBase: this.fileBaseEdited ? this.fileBase : this.currentFileName().replace(/\.[a-z]+$/, ""),
      fileName: this.currentFileName(),
      notice: this.notice
    });
  }
}
