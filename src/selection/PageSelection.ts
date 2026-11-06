// Keeps track of the part of the page the user chose and what they did to it: excluded,
// highlighted, pointed at, commented, redacted, page breaks and block order. While the page
// is reviewed or captured, these choices are applied with temporary attributes, one injected
// style, and recorded text and link changes; restore() undoes every one of them.

export const HIDE_ATTRIBUTE = "data-web2doc-hide";
export const KEEP_ATTRIBUTE = "data-web2doc-keep";
export const TARGET_ATTRIBUTE = "data-web2doc-target";
export const STYLE_ATTRIBUTE = "data-web2doc-style";

export type MarkKind = "exclude" | "highlight" | "arrow" | "redact" | "break";
export type Tool = MarkKind | "comment" | "move";

const MARK_ATTRIBUTES: Record<Exclude<MarkKind, "exclude">, string> = {
  highlight: "data-web2doc-highlight",
  arrow: "data-web2doc-arrow",
  redact: "data-web2doc-redact",
  break: "data-web2doc-break"
};
const COMMENT_ATTRIBUTE = "data-web2doc-comment";
const REORDER_ATTRIBUTE = "data-web2doc-reorder";
const ORDER_ATTRIBUTE = "data-web2doc-order";

/** Characters that replace redacted text, keeping roughly the same width. */
export const REDACTION_CHAR = "█";

/**
 * The temporary style applied while reviewing and capturing. Ancestors of the selection
 * become plain blocks without fixed heights or scrolling, so the selection uses the full page
 * width instead of its old column and reaches the PDF unclipped.
 */
export function selectionStyle(orderCount = 0): string {
  const orders = Array.from({ length: orderCount }, (_v, i) => `[${ORDER_ATTRIBUTE}="${i}"] { order: ${i} !important; }`).join("\n");
  return `[${HIDE_ATTRIBUTE}] { display: none !important; }
[${KEEP_ATTRIBUTE}] { display: block !important; height: auto !important; max-height: none !important; overflow: visible !important; }
[${MARK_ATTRIBUTES.highlight}] { background-color: #fff3a3 !important; box-shadow: 0 0 0 2px #fff3a3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
[${MARK_ATTRIBUTES.arrow}] { outline: 3px solid #e5484d !important; outline-offset: 3px !important; }
[${MARK_ATTRIBUTES.arrow}="relative"] { position: relative !important; }
[${MARK_ATTRIBUTES.arrow}]::before { content: "" !important; position: absolute !important; top: 50% !important; left: -42px !important; width: 26px !important; height: 4px !important; margin-top: -2px !important; background: #e5484d !important; border-radius: 2px !important; }
[${MARK_ATTRIBUTES.arrow}]::after { content: "" !important; position: absolute !important; top: 50% !important; left: -18px !important; width: 0 !important; height: 0 !important; margin-top: -8px !important; border-style: solid !important; border-width: 8px 0 8px 11px !important; border-color: transparent transparent transparent #e5484d !important; }
[${COMMENT_ATTRIBUTE}]::after { content: attr(${COMMENT_ATTRIBUTE}) !important; display: block !important; margin: 6px 0 !important; padding: 6px 10px !important; border: 1px solid #e3c94b !important; border-radius: 4px !important; background: #fff8c5 !important; color: #3d3200 !important; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important; white-space: pre-wrap !important; text-align: left !important; }
[${MARK_ATTRIBUTES.break}] { break-before: page !important; page-break-before: always !important; }
[${MARK_ATTRIBUTES.redact}] { background: #111 !important; color: #111 !important; border-radius: 2px !important; }
[${MARK_ATTRIBUTES.redact}] * { color: #111 !important; text-shadow: none !important; border-color: #111 !important; }
[${MARK_ATTRIBUTES.redact}] :is(img, svg, video, canvas, picture, iframe, object, embed, input, textarea, select),
:is(img, svg, video, canvas, picture, iframe, object, embed, input, textarea, select)[${MARK_ATTRIBUTES.redact}] { visibility: hidden !important; }
[${REORDER_ATTRIBUTE}] { display: flex !important; flex-direction: column !important; }
${orders}`;
}

// Elements that are never rendered, so marking them would only add noise to the page.
const UNRENDERED = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "HEAD", "TITLE", "BASE"]);
const UNSELECTABLE = new Set(["HTML", ...UNRENDERED]);

interface SelectionState {
  marks: Map<Element, Set<MarkKind>>;
  comments: Map<Element, string>;
  /** Children of the selection in the order the user arranged them, or null for page order. */
  order: Element[] | null;
}

function cloneState(state: SelectionState): SelectionState {
  return {
    marks: new Map([...state.marks].map(([element, kinds]) => [element, new Set(kinds)])),
    comments: new Map(state.comments),
    order: state.order ? [...state.order] : null
  };
}

function emptyState(): SelectionState {
  return { marks: new Map(), comments: new Map(), order: null };
}

export type ToggleResult = "added" | "removed" | "ignored";

/** Undoes a page preparation. Calling `restore` more than once is safe. */
export interface PagePreparation {
  restore(): void;
  readonly restored: boolean;
}

export type Direction = "next" | "previous" | "parent" | "child";

export function isSelectable(element: Element): boolean {
  return !UNSELECTABLE.has(element.tagName.toUpperCase());
}

/** The parent element, crossing from a shadow root to its host. */
export function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.parentNode as (Node & { host?: Element }) | null | undefined;
  return root && root.host ? root.host : null;
}

/** Like `contains`, but also looks through shadow roots. */
export function composedContains(ancestor: Element, element: Element): boolean {
  for (let node: Element | null = element; node; node = parentOf(node)) if (node === ancestor) return true;
  return false;
}

/** A short, recognizable label such as `section#intro` or `div.card`. */
export function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id) return `${tag}#${id}`;
  const className = element.getAttribute("class")?.trim().split(/\s+/)[0];
  return className ? `${tag}.${className}` : tag;
}

function collapse(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** A title for the export: the selection's first heading, or the page title. */
export function suggestTitle(target: Element, pageTitle: string): string {
  const heading = /^H[1-3]$/i.test(target.tagName) ? target : target.querySelector("h1, h2, h3");
  const text = collapse(heading?.textContent);
  return (text || collapse(pageTitle) || "Page").slice(0, 120);
}

/**
 * Moves through elements with the keyboard: next/previous sibling (or the parent's sibling
 * at the end of a list), parent, and first child. `canVisit` filters out elements that are
 * not rendered; `bounds` keeps the cursor inside the selection.
 */
export function nextElement(current: Element, direction: Direction, canVisit: (element: Element) => boolean, bounds?: Element): Element | null {
  const inside = (element: Element | null): element is Element => !!element && (!bounds || composedContains(bounds, element));
  if (direction === "parent") {
    const parent = parentOf(current);
    return inside(parent) && isSelectable(parent) && (bounds === undefined || parent !== parentOf(bounds)) ? parent : null;
  }
  if (direction === "child") {
    for (let child = current.firstElementChild; child; child = child.nextElementSibling) if (canVisit(child)) return child;
    return null;
  }
  for (let node: Element | null = current; inside(node) && node !== bounds; node = parentOf(node)) {
    for (let sibling = direction === "next" ? node.nextElementSibling : node.previousElementSibling; sibling;
      sibling = direction === "next" ? sibling.nextElementSibling : sibling.previousElementSibling) {
      if (canVisit(sibling) && inside(sibling)) return sibling;
    }
  }
  return null;
}

export class PageSelection {
  private chosen: Element | null = null;
  private state: SelectionState = emptyState();
  private history: SelectionState[] = [];

  get target(): Element | null {
    return this.chosen;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get canExpand(): boolean {
    const parent = this.chosen ? parentOf(this.chosen) : null;
    return parent !== null && isSelectable(parent);
  }

  get exclusions(): readonly Element[] {
    return this.elementsWith("exclude");
  }

  /** Elements carrying a mark, in the order they were marked. */
  elementsWith(kind: MarkKind): Element[] {
    return [...this.state.marks].filter(([, kinds]) => kinds.has(kind)).map(([element]) => element);
  }

  get comments(): ReadonlyMap<Element, string> {
    return this.state.comments;
  }

  /** Children of the selection in export order. */
  orderedChildren(): Element[] {
    const children = this.chosen ? Array.from(this.chosen.children) : [];
    const order = this.state.order?.filter((element) => children.includes(element));
    if (!order) return children;
    return [...order, ...children.filter((child) => !order.includes(child))];
  }

  get reordered(): boolean {
    return this.state.order !== null;
  }

  /** How many changes of each kind the user made, for the panel summary. */
  counts(): Record<MarkKind | "comment", number> & { moved: boolean } {
    return {
      exclude: this.elementsWith("exclude").length,
      highlight: this.elementsWith("highlight").length,
      arrow: this.elementsWith("arrow").length,
      redact: this.elementsWith("redact").length,
      break: this.elementsWith("break").length,
      comment: this.state.comments.size,
      moved: this.state.order !== null
    };
  }

  get hasChanges(): boolean {
    return this.state.marks.size > 0 || this.state.comments.size > 0 || this.state.order !== null;
  }

  /** Chooses a new part of the page and forgets earlier changes. */
  choose(element: Element): boolean {
    if (!isSelectable(element)) return false;
    this.chosen = element;
    this.state = emptyState();
    this.history = [];
    return true;
  }

  /** Grows the selection to its parent element. Changes stay, since they are still inside it. */
  expand(): boolean {
    const parent = this.chosen ? parentOf(this.chosen) : null;
    if (!parent || !isSelectable(parent)) return false;
    this.chosen = parent;
    if (this.state.order) {
      this.record();
      this.state.order = null; // the order applied to the previous selection's children
    }
    return true;
  }

  clear(): void {
    this.chosen = null;
    this.state = emptyState();
    this.history = [];
  }

  has(element: Element, kind: MarkKind): boolean {
    return this.state.marks.get(element)?.has(kind) ?? false;
  }

  /** The element carrying `kind` that covers `element`: the element itself or an ancestor. */
  markedAncestor(element: Element, kind: MarkKind): Element | undefined {
    for (let node: Element | null = element; node && node !== this.chosen; node = parentOf(node)) {
      if (this.has(node, kind)) return node;
    }
    return this.chosen && this.has(this.chosen, kind) ? this.chosen : undefined;
  }

  /** Kept for callers that only deal with exclusions. */
  exclusionFor(element: Element): Element | undefined {
    return this.markedAncestor(element, "exclude");
  }

  private inside(element: Element): boolean {
    return !!this.chosen && composedContains(this.chosen, element);
  }

  private record(): void {
    this.history.push(cloneState(this.state));
  }

  private setMark(element: Element, kind: MarkKind, on: boolean): void {
    const kinds = this.state.marks.get(element) ?? new Set<MarkKind>();
    if (on) kinds.add(kind);
    else kinds.delete(kind);
    if (kinds.size) this.state.marks.set(element, kinds);
    else this.state.marks.delete(element);
  }

  /**
   * Adds or removes a mark. Exclusions and redactions cover their descendants, so clicking
   * inside an excluded part brings that whole part back. The selection itself can be
   * highlighted, pointed at or redacted, but not excluded or broken onto a new page.
   */
  toggle(kind: MarkKind, element: Element): ToggleResult {
    if (!this.chosen || !this.inside(element)) return "ignored";
    if (element === this.chosen && (kind === "exclude" || kind === "break")) return "ignored";
    const covering = kind === "exclude" || kind === "redact" ? this.markedAncestor(element, kind) : (this.has(element, kind) ? element : undefined);
    this.record();
    if (covering) {
      this.setMark(covering, kind, false);
      return "removed";
    }
    this.setMark(element, kind, true);
    return "added";
  }

  /** Legacy name for toggling an exclusion. */
  toggleExclusion(element: Element): ToggleResult {
    return this.toggle("exclude", element);
  }

  setComment(element: Element, text: string): boolean {
    if (!this.inside(element)) return false;
    const value = text.trim().slice(0, 2000);
    const previous = this.state.comments.get(element);
    if ((previous ?? "") === value) return false;
    this.record();
    if (value) this.state.comments.set(element, value);
    else this.state.comments.delete(element);
    return true;
  }

  /** The child of the selection that contains `element`; blocks move among these. */
  blockFor(element: Element): Element | null {
    if (!this.chosen || element === this.chosen || !this.inside(element)) return null;
    let node: Element | null = element;
    while (node && parentOf(node) !== this.chosen) node = parentOf(node);
    return node && node.parentElement === this.chosen ? node : null;
  }

  /** Moves a block up (-1) or down (+1) among the selection's children. */
  move(block: Element, delta: -1 | 1): boolean {
    const order = this.orderedChildren();
    const index = order.indexOf(block);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return false;
    this.record();
    [order[index], order[target]] = [order[target] as Element, block];
    this.state.order = order;
    return true;
  }

  /** Removes every change as one step that can be undone. */
  restoreAll(): boolean {
    if (!this.hasChanges) return false;
    this.record();
    this.state = emptyState();
    return true;
  }

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.state = previous;
    return true;
  }

  /** Whether extraction should skip `element` (excluded by the user). */
  isExcluded(element: Element): boolean {
    return this.has(element, "exclude");
  }

  /**
   * Applies the selection to the page: hides everything outside it and the excluded parts,
   * draws highlights, arrows and comments, redacts text and links, adds page breaks and
   * reorders blocks, and optionally sets the document title used in the export metadata.
   * If any step fails, the changes made so far are undone before the error is rethrown.
   */
  prepare(doc: Document, options: { title?: string } = {}): PagePreparation {
    const target = this.chosen;
    if (!target?.isConnected) throw new Error("The selected part of the page is no longer available.");

    const attributes: Array<[Element, string, string | null]> = [];
    const texts: Array<[Node, string]> = [];
    const styles: Element[] = [];
    const originalTitle = doc.title;
    let titleChanged = false;
    let restored = false;

    const preparation: PagePreparation = {
      restore() {
        if (restored) return;
        restored = true;
        for (const [node, value] of texts.reverse()) node.nodeValue = value;
        for (const [element, name, value] of attributes.reverse()) {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }
        texts.length = 0;
        attributes.length = 0;
        for (const style of styles) style.remove();
        if (titleChanged) doc.title = originalTitle;
      },
      get restored() {
        return restored;
      }
    };

    const set = (element: Element, name: string, value = ""): void => {
      attributes.push([element, name, element.getAttribute(name)]);
      element.setAttribute(name, value);
    };
    const mark = (element: Element, name: string, value = ""): void => {
      if (!element.hasAttribute(name)) set(element, name, value);
    };
    const roots = new Set<Node>();
    const noteRoot = (element: Element): void => {
      const root = element.getRootNode?.();
      if (root && root !== doc && "host" in root) roots.add(root);
    };

    try {
      const body = doc.body;
      mark(target, TARGET_ATTRIBUTE);
      noteRoot(target);
      for (let node: Element = target; node !== body; ) {
        const parent = parentOf(node);
        if (!parent) break;
        const container: ParentNode = node.parentElement ?? (node.parentNode as ParentNode);
        for (const sibling of Array.from(container.children)) {
          if (sibling !== node && !UNRENDERED.has(sibling.tagName.toUpperCase())) mark(sibling, HIDE_ATTRIBUTE);
        }
        mark(parent, KEEP_ATTRIBUTE);
        noteRoot(parent);
        node = parent;
      }

      for (const [element, kinds] of this.state.marks) {
        noteRoot(element);
        if (kinds.has("exclude")) mark(element, HIDE_ATTRIBUTE);
        if (kinds.has("highlight")) mark(element, MARK_ATTRIBUTES.highlight);
        if (kinds.has("break")) mark(element, MARK_ATTRIBUTES.break);
        if (kinds.has("arrow")) {
          const view = doc.defaultView;
          const position = view?.getComputedStyle ? view.getComputedStyle(element).position : "static";
          mark(element, MARK_ATTRIBUTES.arrow, position === "static" ? "relative" : "");
        }
        if (kinds.has("redact")) {
          mark(element, MARK_ATTRIBUTES.redact);
          this.redact(element, texts, set);
        }
      }
      for (const [element, text] of this.state.comments) {
        noteRoot(element);
        set(element, COMMENT_ATTRIBUTE, text);
      }
      const order = this.state.order ? this.orderedChildren() : [];
      if (order.length) {
        mark(target, REORDER_ATTRIBUTE);
        order.forEach((child, index) => set(child, ORDER_ATTRIBUTE, String(index)));
      }

      const css = selectionStyle(order.length);
      for (const root of [doc as Node, ...roots]) {
        const style = doc.createElement("style");
        style.setAttribute(STYLE_ATTRIBUTE, "");
        style.textContent = css;
        const parent = root === doc ? (doc.head ?? doc.documentElement) : (root as unknown as ParentNode);
        parent.append(style);
        styles.push(style);
      }

      const title = collapse(options.title);
      if (title) {
        doc.title = title;
        titleChanged = true;
      }
    } catch (error) {
      preparation.restore();
      throw error;
    }
    return preparation;
  }

  /** Replaces text with blocks and removes link targets so neither reaches the exported file. */
  private redact(element: Element, texts: Array<[Node, string]>, set: (element: Element, name: string, value?: string) => void): void {
    const visit = (node: Node): void => {
      if (node.nodeType === 3) {
        const value = node.nodeValue ?? "";
        if (/\S/.test(value)) {
          texts.push([node, value]);
          node.nodeValue = value.replace(/\S/g, REDACTION_CHAR);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      // Link targets become PDF link annotations, and alternative texts can reach tagged
      // PDFs; images, frames and form fields themselves are hidden by the injected style.
      if (el.hasAttribute("href")) {
        set(el, "href", "");
        el.removeAttribute("href");
      }
      for (const name of ["title", "alt", "aria-label", "placeholder"]) {
        if (el.hasAttribute(name)) set(el, name, REDACTION_CHAR.repeat(3));
      }
      for (const child of Array.from(el.childNodes)) visit(child);
    };
    visit(element);
  }
}
