// Turns part of a live page into a PageDocument: headings, paragraphs, lists, tables, code
// blocks, quotes, images and links, with the user's exclusions, redactions, comments and
// highlights applied. Only DOM interfaces are used, so tests can run it on a DOM double.

import { DOCUMENT_SCHEMA_URL, DOCUMENT_SCHEMA_VERSION, type Block, type Inline, type Mark, type PageDocument, type TableCell } from "./model";

export interface ExtractOptions {
  /** Base URL for relative links and images. */
  baseUrl: string;
  /** Elements the user excluded, or that are not rendered. */
  skip?(element: Element): boolean;
  /** Elements whose content is replaced by a redaction marker. */
  redacted?(element: Element): boolean;
  highlighted?(element: Element): boolean;
  comment?(element: Element): string | undefined;
  pageBreakBefore?(element: Element): boolean;
  /** Child nodes in the order the user arranged them. */
  childNodes?(element: Element): ChildNode[];
  /** Leaves out navigation, banners, sidebars, forms and footers: the "clean article" view. */
  dropPageChrome?: boolean;
}

export const REDACTED_TEXT = "█████";

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME", "OBJECT", "EMBED",
  "AUDIO", "VIDEO", "SELECT", "OPTION", "INPUT", "TEXTAREA", "BUTTON", "DIALOG", "HEAD", "TITLE", "META", "LINK",
  "WEB2DOC-SELECTION", "WEB2DOC-TABLE-HIGHLIGHT"]);
const PAGE_CHROME_TAGS = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "FORM"]);
const PAGE_CHROME_ROLES = new Set(["navigation", "banner", "contentinfo", "complementary", "search", "menu", "menubar", "toolbar"]);
const CONTAINER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "NAV", "ASIDE", "FORM",
  "FIGURE", "FIGCAPTION", "DETAILS", "SUMMARY", "ADDRESS", "BODY", "HTML", "CENTER", "DL", "DT", "DD", "FIELDSET", "LEGEND", "HGROUP", "SEARCH"]);
const MARK_TAGS: Record<string, Mark> = {
  STRONG: "bold", B: "bold", EM: "italic", I: "italic", CITE: "italic", DFN: "italic", VAR: "italic",
  MARK: "highlight", S: "strike", DEL: "strike", STRIKE: "strike"
};
const CODE_TAGS = new Set(["CODE", "KBD", "SAMP", "TT"]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function collapse(text: string): string {
  return text.replace(/[\s ]+/g, " ");
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function addMark(marks: readonly Mark[], mark: Mark): Mark[] {
  return marks.includes(mark) ? [...marks] : [...marks, mark];
}

function textInline(text: string, marks: readonly Mark[]): Inline {
  return marks.length ? { type: "text", text, marks: [...marks] } : { type: "text", text };
}

/** Joins neighboring text with the same marks and trims the edges of a run of inline content. */
export function normalizeInlines(inlines: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const inline of inlines) {
    const previous = merged.at(-1);
    if (inline.type === "text" && previous?.type === "text"
        && (previous.marks ?? []).join() === (inline.marks ?? []).join()) {
      merged[merged.length - 1] = { ...previous, text: previous.text + inline.text };
    } else {
      merged.push(inline);
    }
  }
  // Collapse spaces across element boundaries and around line breaks.
  for (let i = 0; i < merged.length; i++) {
    const inline = merged[i];
    if (inline?.type !== "text") continue;
    const previous = merged[i - 1];
    let text = inline.text;
    if (i === 0 || previous?.type === "break" || (previous?.type === "text" && previous.text.endsWith(" "))) text = text.replace(/^ +/, "");
    if (merged[i + 1]?.type === "break" || i === merged.length - 1) text = text.replace(/ +$/, "");
    merged[i] = { ...inline, text };
  }
  const result = merged.filter((inline) => inline.type !== "text" || inline.text !== "");
  while (result[0]?.type === "break") result.shift();
  while (result.at(-1)?.type === "break") result.pop();
  return result;
}

function hasContent(inlines: readonly Inline[]): boolean {
  return inlines.some((inline) => inline.type === "image" || (inline.type === "text" && inline.text.trim() !== "")
    || (inline.type === "link" && hasContent(inline.children)));
}

export class DocumentExtractor {
  constructor(private readonly options: ExtractOptions) {}

  private children(element: Element): ChildNode[] {
    return this.options.childNodes?.(element) ?? Array.from(element.childNodes);
  }

  private isPageChrome(element: Element): boolean {
    if (!this.options.dropPageChrome) return false;
    const role = element.getAttribute("role") ?? "";
    return PAGE_CHROME_TAGS.has(element.tagName.toUpperCase()) || PAGE_CHROME_ROLES.has(role);
  }

  private skipped(element: Element): boolean {
    const tag = element.tagName.toUpperCase();
    return SKIPPED_TAGS.has(tag)
      || element.getAttribute("aria-hidden") === "true"
      || element.hasAttribute("hidden")
      || this.isPageChrome(element)
      || (this.options.skip?.(element) ?? false);
  }

  /** Blocks for the content of `root` (the root itself is treated as a container). */
  blocks(root: Element): Block[] {
    if (this.skipped(root)) return [];
    if (this.options.redacted?.(root)) return [{ type: "paragraph", content: [{ type: "text", text: REDACTED_TEXT }] }];
    const own = this.blockFor(root);
    return own ?? this.containerBlocks(root);
  }

  private containerBlocks(element: Element, marks: readonly Mark[] = []): Block[] {
    const blocks: Block[] = [];
    let inline: Inline[] = [];
    const flush = (): void => {
      const content = normalizeInlines(inline);
      if (hasContent(content)) blocks.push({ type: "paragraph", content });
      inline = [];
    };

    for (const node of this.children(element)) {
      if (node.nodeType === TEXT_NODE) {
        inline.push(textInline(collapse(node.textContent ?? ""), marks));
        continue;
      }
      if (node.nodeType !== ELEMENT_NODE) continue;
      const child = node as Element;
      if (this.skipped(child)) continue;
      if (this.options.pageBreakBefore?.(child)) {
        flush();
        blocks.push({ type: "pageBreak" });
      }
      const comment = this.options.comment?.(child);
      if (this.options.redacted?.(child)) {
        if (this.isBlockElement(child)) {
          flush();
          blocks.push({ type: "paragraph", content: [{ type: "text", text: REDACTED_TEXT }] });
        } else {
          inline.push({ type: "text", text: REDACTED_TEXT });
        }
      } else if (this.isBlockElement(child)) {
        flush();
        const own = this.blockFor(child);
        const childMarks = this.options.highlighted?.(child) ? addMark(marks, "highlight") : marks;
        blocks.push(...(own ?? this.containerBlocks(child, childMarks)));
      } else {
        inline.push(...this.inlines(child, marks));
      }
      if (comment) {
        flush();
        blocks.push({ type: "note", text: comment });
      }
    }
    flush();
    return blocks;
  }

  private isBlockElement(element: Element): boolean {
    const tag = element.tagName.toUpperCase();
    return CONTAINER_TAGS.has(tag) || /^H[1-6]$/.test(tag)
      || ["P", "UL", "OL", "LI", "TABLE", "PRE", "BLOCKQUOTE", "HR"].includes(tag);
  }

  /** The block an element maps to, or undefined when it is a plain container. */
  private blockFor(element: Element): Block[] | undefined {
    const tag = element.tagName.toUpperCase();
    const marks: Mark[] = this.options.highlighted?.(element) ? ["highlight"] : [];
    const heading = /^H([1-6])$/.exec(tag);
    if (heading) {
      const content = normalizeInlines(this.inlineChildren(element, marks));
      return hasContent(content) ? [{ type: "heading", level: Number(heading[1]) as 1, content }] : [];
    }
    switch (tag) {
      case "P": {
        // A paragraph can still hold block content in broken markup; treat it as a container.
        return this.containerBlocks(element, marks);
      }
      case "UL":
      case "OL": {
        const items = this.children(element)
          .filter((node): node is Element => node.nodeType === ELEMENT_NODE && !this.skipped(node as Element))
          .map((item) => (this.options.redacted?.(item)
            ? [{ type: "paragraph", content: [{ type: "text", text: REDACTED_TEXT }] } satisfies Block]
            : this.containerBlocks(item, marks)))
          .filter((item) => item.length > 0);
        if (items.length === 0) return [];
        const start = Number(element.getAttribute("start"));
        return [{ type: "list", ordered: tag === "OL", ...(tag === "OL" && Number.isInteger(start) && start !== 1 && element.hasAttribute("start") ? { start } : {}), items }];
      }
      case "TABLE":
        return this.table(element as HTMLTableElement);
      case "PRE": {
        const code = element.querySelector("code");
        const className = `${element.getAttribute("class") ?? ""} ${code?.getAttribute("class") ?? ""}`;
        const language = /(?:language|lang)-([\w+#.-]+)/.exec(className)?.[1];
        const text = (element.textContent ?? "").replace(/\n$/, "");
        return text.trim() ? [{ type: "code", ...(language ? { language } : {}), text }] : [];
      }
      case "BLOCKQUOTE": {
        const blocks = this.containerBlocks(element, marks);
        return blocks.length ? [{ type: "quote", blocks }] : [];
      }
      case "HR":
        return [{ type: "rule" }];
      default:
        return undefined;
    }
  }

  private table(table: HTMLTableElement): Block[] {
    const rows: TableCell[][] = [];
    for (const row of tableRows(table)) {
      if (this.skipped(row)) continue;
      const inHead = row.parentElement?.tagName.toUpperCase() === "THEAD";
      const cells = rowCells(row).filter((cell) => !this.skipped(cell)).map((cell): TableCell => {
        const header = inHead || cell.tagName.toUpperCase() === "TH";
        if (this.options.redacted?.(cell) || this.options.redacted?.(row)) {
          return { header, content: [{ type: "text", text: REDACTED_TEXT }] };
        }
        return { header, content: this.flatten(this.containerBlocks(cell)) };
      });
      if (cells.length) rows.push(cells);
    }
    return rows.length ? [{ type: "table", rows }] : [];
  }

  /** Inline content of blocks, separated by line breaks (for table cells). */
  private flatten(blocks: Block[]): Inline[] {
    const result: Inline[] = [];
    for (const block of blocks) {
      const content: Inline[] = block.type === "heading" || block.type === "paragraph" ? block.content
        : block.type === "code" ? [{ type: "text", text: block.text, marks: ["code"] }]
        : block.type === "list" ? block.items.flatMap((item) => [{ type: "text", text: "• " } as Inline, ...this.flatten(item), { type: "break" } as Inline])
        : block.type === "note" ? [{ type: "text", text: `Note: ${block.text}` }]
        : block.type === "quote" ? this.flatten(block.blocks)
        : [];
      if (content.length) {
        if (result.length) result.push({ type: "break" });
        result.push(...content);
      }
    }
    return normalizeInlines(result);
  }

  private inlineChildren(element: Element, marks: readonly Mark[]): Inline[] {
    const result: Inline[] = [];
    for (const node of this.children(element)) {
      if (node.nodeType === TEXT_NODE) result.push(textInline(collapse(node.textContent ?? ""), marks));
      else if (node.nodeType === ELEMENT_NODE && !this.skipped(node as Element)) result.push(...this.inlines(node as Element, marks));
    }
    return result;
  }

  private inlines(element: Element, marks: readonly Mark[]): Inline[] {
    if (this.options.redacted?.(element)) return [{ type: "text", text: REDACTED_TEXT }];
    const tag = element.tagName.toUpperCase();
    let current = this.options.highlighted?.(element) ? addMark(marks, "highlight") : [...marks];
    if (tag === "BR") return [{ type: "break" }];
    if (tag === "IMG") {
      const src = element.getAttribute("src") ?? "";
      if (!src || src.startsWith("data:") && src.length > 200_000) return [];
      return [{ type: "image", src: absoluteUrl(src, this.options.baseUrl), alt: collapse(element.getAttribute("alt") ?? "").trim() }];
    }
    if (CODE_TAGS.has(tag)) return [textInline(collapse(element.textContent ?? ""), addMark(current, "code"))];
    const mark = MARK_TAGS[tag];
    if (mark) current = addMark(current, mark);
    const children = this.inlineChildren(element, current);
    if (tag === "A") {
      const href = element.getAttribute("href");
      if (href && !href.startsWith("javascript:")) {
        const absolute = href.startsWith("#") ? absoluteUrl(href, this.options.baseUrl) : absoluteUrl(href, this.options.baseUrl);
        return [{ type: "link", href: absolute, children: normalizeInlines(children) }];
      }
    }
    return children;
  }
}

/** The table's own rows (not those of nested tables), in header, body, footer order. */
function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    const tag = child.tagName.toUpperCase();
    if (tag === "TR") rows.push(child);
    else if (tag === "THEAD" || tag === "TBODY" || tag === "TFOOT") {
      rows.push(...Array.from(child.children).filter((row) => row.tagName.toUpperCase() === "TR"));
    }
  }
  return rows;
}

function rowCells(row: Element): Element[] {
  return Array.from(row.children).filter((cell) => /^T[DH]$/i.test(cell.tagName));
}

export interface DocumentInfo {
  title: string;
  url: string;
  language?: string;
  capturedAt?: Date;
}

export function buildDocument(root: Element, info: DocumentInfo, options: ExtractOptions): PageDocument {
  const blocks = new DocumentExtractor(options).blocks(root);
  return {
    $schema: DOCUMENT_SCHEMA_URL,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    title: info.title,
    url: info.url,
    capturedAt: (info.capturedAt ?? new Date()).toISOString(),
    ...(info.language ? { language: info.language } : {}),
    blocks
  };
}

/** The element holding the page's main content: <main>, role=main, or the longest article. */
export function findMainContent(doc: Document): Element {
  const main = doc.querySelector("main, [role='main']");
  if (main) return main;
  const articles = Array.from(doc.querySelectorAll("article"));
  if (articles.length) {
    return articles.reduce((best, article) => ((article.textContent ?? "").length > (best.textContent ?? "").length ? article : best));
  }
  return doc.body ?? doc.documentElement;
}
