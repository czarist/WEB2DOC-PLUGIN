import assert from "node:assert/strict";
import test from "node:test";
import { routeBackgroundMessage } from "../src/background/BackgroundRouter.ts";
import { pdfFileName } from "../src/background/PageCaptureService.ts";
import { isSelectionImageRequest, isSelectionPDFRequest, type ExportResult, type SelectionImageRequest, type SelectionPDFRequest } from "../src/shared/messages.ts";
import { DEFAULT_PREFERENCES } from "../src/shared/settings.ts";
import { HIDE_ATTRIBUTE, KEEP_ATTRIBUTE, PageSelection, REDACTION_CHAR, TARGET_ATTRIBUTE, describeElement, nextElement } from "../src/selection/PageSelection.ts";
import { SelectionController, type Notice, type SelectionSnapshot, type SelectionView } from "../src/selection/SelectionController.ts";

// A small DOM double: enough tree, text and attribute behavior for selection and preparation.
class FakeText {
  readonly nodeType = 3;
  parentElement: FakeElement | null = null;
  constructor(public nodeValue: string) {}
  get textContent(): string { return this.nodeValue; }
}

class FakeElement {
  readonly nodeType = 1;
  parentElement: FakeElement | null = null;
  childNodes: Array<FakeElement | FakeText> = [];
  readonly attributes = new Map<string, string>();
  failOnSetAttribute = false;

  constructor(readonly tagName: string, attributes: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }

  get firstElementChild(): FakeElement | null { return this.children[0] ?? null; }

  get nextElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  get previousElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [new FakeText(value)];
  }

  get isConnected(): boolean {
    let node: FakeElement | null = this;
    while (node.parentElement) node = node.parentElement;
    return node.tagName === "HTML";
  }

  append(...children: Array<FakeElement | FakeText | string>): this {
    for (const child of children) {
      const node = typeof child === "string" ? new FakeText(child) : child;
      node.parentElement = this;
      this.childNodes.push(node);
    }
    return this;
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
    this.parentElement = null;
  }

  contains(other: FakeElement): boolean {
    for (let node: FakeElement | null = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }

  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  setAttribute(name: string, value: string): void {
    if (this.failOnSetAttribute) throw new Error("Blocked by the page");
    this.attributes.set(name, value);
  }

  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelector(selector: string): FakeElement | null {
    const tags = selector.split(",").map((part) => part.trim().toUpperCase());
    return this.descendants().find((element) => tags.includes(element.tagName)
      || (tags.includes("[ROLE='MAIN']") && element.getAttribute("role") === "main")) ?? null;
  }
}

function el(tagName: string, attributes: Record<string, string> = {}, ...children: Array<FakeElement | string>): FakeElement {
  return new FakeElement(tagName, attributes).append(...children);
}

function page() {
  const link = el("A", { href: "https://secret.example/account", title: "Account 12345" }, "account 12345");
  const heading = el("H1", {}, "  Quarterly   report ");
  const intro = el("P", { class: "intro" }, "Revenue grew. Contact ", link, ".");
  const aside = el("ASIDE", { class: "ad" }, "Buy now");
  const table = el("TABLE");
  const article = el("ARTICLE", { class: "post" }, heading, intro, aside, table);
  const sidebar = el("NAV");
  const main = el("MAIN", { id: "content" }, article, sidebar);
  const header = el("HEADER", { class: "site-header fixed" });
  const footer = el("FOOTER");
  const script = el("SCRIPT");
  const head = el("HEAD");
  const body = el("BODY", {}, header, main, footer, script);
  const html = el("HTML", {}, head, body);

  const doc = {
    title: "Acme · Reports",
    URL: "https://acme.example/reports",
    documentElement: html,
    head,
    body,
    createElement: (tag: string) => el(tag.toUpperCase()),
    querySelector: (selector: string) => html.querySelector(selector)
  };
  const snapshot = () => JSON.stringify([html, ...html.descendants()].map((element) => [
    element.tagName,
    // Attribute order can change when an attribute is removed and set again; values cannot.
    [...element.attributes].sort(([x], [y]) => x.localeCompare(y)),
    element.childNodes.filter((node) => node instanceof FakeText).map((node) => node.nodeValue)
  ]));
  return { doc, html, head, body, header, main, article, heading, intro, link, aside, table, sidebar, footer, script, snapshot };
}

const asDocument = (doc: unknown) => doc as Document;
const asElement = (element: FakeElement) => element as unknown as Element;

test("prepares only the selection and its exclusions, then restores the page exactly", () => {
  const p = page();
  const before = p.snapshot();
  const selection = new PageSelection();
  assert.equal(selection.choose(asElement(p.article)), true);
  assert.equal(selection.toggle("exclude", asElement(p.aside)), "added");

  const preparation = selection.prepare(asDocument(p.doc), { title: "  Q3   results " });
  for (const hidden of [p.header, p.footer, p.sidebar, p.aside]) assert.equal(hidden.hasAttribute(HIDE_ATTRIBUTE), true, hidden.tagName);
  for (const kept of [p.main, p.body]) assert.equal(kept.hasAttribute(KEEP_ATTRIBUTE), true, kept.tagName);
  assert.equal(p.article.hasAttribute(TARGET_ATTRIBUTE), true);
  for (const untouched of [p.html, p.head, p.heading, p.table, p.script]) {
    assert.equal(untouched.hasAttribute(HIDE_ATTRIBUTE) || untouched.hasAttribute(KEEP_ATTRIBUTE), false, untouched.tagName);
  }
  const style = p.head.children.at(-1);
  assert.equal(style?.tagName, "STYLE");
  assert.match(style?.textContent ?? "", /display: none !important/);
  assert.equal(p.doc.title, "Q3 results");

  preparation.restore();
  assert.equal(preparation.restored, true);
  assert.equal(p.snapshot(), before);
  assert.equal(p.head.children.length, 0);
  assert.equal(p.doc.title, "Acme · Reports");
  preparation.restore();
  assert.equal(p.doc.title, "Acme · Reports");
});

test("applies highlights, arrows, comments, page breaks, block order and redaction, and undoes all of them", () => {
  const p = page();
  const before = p.snapshot();
  const selection = new PageSelection();
  selection.choose(asElement(p.article));
  selection.toggle("highlight", asElement(p.heading));
  selection.toggle("arrow", asElement(p.table));
  selection.toggle("break", asElement(p.table));
  selection.setComment(asElement(p.intro), "  Check these numbers  ");
  selection.toggle("redact", asElement(p.intro));
  selection.move(asElement(p.table), -1);
  selection.move(asElement(p.table), -1);

  const preparation = selection.prepare(asDocument(p.doc));
  assert.equal(p.heading.hasAttribute("data-web2doc-highlight"), true);
  assert.equal(p.table.getAttribute("data-web2doc-arrow"), "relative");
  assert.equal(p.table.hasAttribute("data-web2doc-break"), true);
  assert.equal(p.intro.getAttribute("data-web2doc-comment"), "Check these numbers");
  assert.equal(p.article.hasAttribute("data-web2doc-reorder"), true);
  assert.deepEqual([p.heading, p.table, p.intro, p.aside].map((element) => element.getAttribute("data-web2doc-order")), ["0", "1", "2", "3"]);
  // Redacted text and link targets do not reach the capture.
  assert.equal(p.intro.textContent.includes("12345"), false);
  assert.match(p.intro.textContent, new RegExp(`^${REDACTION_CHAR}+ ${REDACTION_CHAR}+`));
  assert.equal(p.link.hasAttribute("href"), false);
  assert.equal(p.link.getAttribute("title"), REDACTION_CHAR.repeat(3));
  assert.match(p.head.children[0]?.textContent ?? "", /\[data-web2doc-order="3"\] \{ order: 3 !important; \}/);

  preparation.restore();
  assert.equal(p.snapshot(), before);
  assert.equal(p.link.getAttribute("href"), "https://secret.example/account");
  assert.equal(p.intro.textContent, "Revenue grew. Contact account 12345.");
});

test("excludes parts, brings them back, undoes changes, and keeps changes when the selection grows", () => {
  const p = page();
  const selection = new PageSelection();
  assert.equal(selection.toggle("exclude", asElement(p.intro)), "ignored", "nothing is selected yet");
  assert.equal(selection.choose(asElement(p.html)), false, "the whole document is not a selection");
  selection.choose(asElement(p.article));

  assert.equal(selection.toggle("exclude", asElement(p.article)), "ignored", "the selection cannot exclude itself");
  assert.equal(selection.toggle("break", asElement(p.article)), "ignored");
  assert.equal(selection.toggle("exclude", asElement(p.sidebar)), "ignored", "outside the selection");
  assert.equal(selection.toggle("exclude", asElement(p.intro)), "added");
  assert.equal(selection.toggle("exclude", asElement(p.table)), "added");
  assert.equal(selection.toggle("exclude", asElement(p.link)), "removed", "clicking inside an excluded part brings it back");
  assert.deepEqual(selection.exclusions, [p.table]);
  assert.equal(selection.toggle("highlight", asElement(p.article)), "added", "the selection itself can be highlighted");

  assert.equal(selection.undo(), true);
  assert.equal(selection.undo(), true);
  assert.deepEqual(selection.exclusions, [p.intro, p.table]);
  assert.equal(selection.restoreAll(), true);
  assert.equal(selection.hasChanges, false);
  assert.equal(selection.undo(), true, "restore all is one step");
  assert.equal(selection.exclusions.length, 2);
  assert.deepEqual(selection.counts(), { exclude: 2, highlight: 0, arrow: 0, redact: 0, break: 0, comment: 0, moved: false });

  assert.equal(selection.blockFor(asElement(p.link)), asElement(p.intro));
  assert.equal(selection.blockFor(asElement(p.article)), null);
  assert.equal(selection.move(asElement(p.heading), -1), false, "the first block cannot move up");

  assert.equal(selection.expand(), true);
  assert.equal(selection.target, asElement(p.main));
  assert.equal(selection.exclusions.length, 2);
  selection.choose(asElement(p.footer));
  assert.deepEqual(selection.exclusions, []);
  assert.equal(selection.canUndo, false);

  assert.equal(describeElement(asElement(p.main)), "main#content");
  assert.equal(describeElement(asElement(p.header)), "header.site-header");
  assert.equal(describeElement(asElement(p.table)), "table");
});

test("moves through elements with the keyboard inside the selection", () => {
  const p = page();
  const visible = () => true;
  assert.equal(nextElement(asElement(p.heading), "next", visible), asElement(p.intro));
  assert.equal(nextElement(asElement(p.intro), "previous", visible), asElement(p.heading));
  assert.equal(nextElement(asElement(p.intro), "child", visible), asElement(p.link));
  assert.equal(nextElement(asElement(p.link), "parent", visible), asElement(p.intro));
  // At the end of a list, "next" continues after the parent.
  assert.equal(nextElement(asElement(p.table), "next", visible), asElement(p.sidebar));
  // Bounds keep the cursor inside the selection.
  assert.equal(nextElement(asElement(p.table), "next", visible, asElement(p.article)), null);
  assert.equal(nextElement(asElement(p.heading), "parent", visible, asElement(p.article)), asElement(p.article));
  assert.equal(nextElement(asElement(p.article), "parent", visible, asElement(p.article)), null);
  assert.equal(nextElement(asElement(p.heading), "next", (element) => element !== asElement(p.intro)), asElement(p.aside));
});

test("undoes a partial preparation when the page rejects a change", () => {
  const p = page();
  const before = p.snapshot();
  const selection = new PageSelection();
  selection.choose(asElement(p.article));
  selection.toggle("redact", asElement(p.intro));
  p.footer.failOnSetAttribute = true;

  assert.throws(() => selection.prepare(asDocument(p.doc), { title: "Report" }), /Blocked by the page/);
  assert.equal(p.snapshot(), before);
  assert.equal(p.head.children.length, 0);
  assert.equal(p.doc.title, "Acme · Reports");

  p.footer.failOnSetAttribute = false;
  p.article.remove();
  assert.throws(() => selection.prepare(asDocument(p.doc)), /no longer available/);
});

function fakeView() {
  const renders: SelectionSnapshot[] = [];
  const closed: Array<Notice | null> = [];
  const hidden: boolean[] = [];
  const revealed: unknown[] = [];
  let reviews = 0;
  const view: SelectionView = {
    render: (snapshot) => { renders.push(snapshot); },
    setCaptureHidden: (value) => { hidden.push(value); },
    showReview: () => { reviews++; },
    reveal: (element) => { revealed.push(element); },
    close: (notice) => { closed.push(notice); }
  };
  return { view, renders, closed, hidden, revealed, last: () => renders.at(-1), reviews: () => reviews };
}

type Sent = SelectionPDFRequest | SelectionImageRequest;

function controller(send: (request: Sent) => Promise<unknown>, options: { timeoutMs?: number; saveDocument?: (format: string, name: string) => Promise<ExportResult>; copy?: boolean } = {}) {
  const p = page();
  const view = fakeView();
  const copied: string[] = [];
  const selection = new SelectionController({
    view: view.view,
    document: asDocument(p.doc),
    send,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.saveDocument ? { saveDocument: ({ format, fileName }) => options.saveDocument!(format, fileName) } : {}),
    markdown: (_chosen, title) => `# ${title}`,
    copyText: async (text) => { copied.push(text); return options.copy ?? true; }
  });
  return { p, view, selection, copied };
}

test("walks through choosing, excluding and reviewing, and Escape restores the page", () => {
  const { p, view, selection } = controller(async () => { throw new Error("not used"); });
  const before = p.snapshot();

  assert.equal(selection.start().success, true);
  assert.equal(view.last()?.step, "picking");
  selection.hover(asElement(p.article));
  assert.equal(view.last()?.hovered, asElement(p.article));
  selection.click(asElement(p.article));
  assert.equal(view.last()?.step, "editing");
  assert.equal(view.last()?.title, "Quarterly report");
  assert.equal(view.last()?.fileName, "Quarterly report.pdf");
  assert.equal(p.snapshot(), before, "choosing does not change the page");

  selection.click(asElement(p.aside));
  assert.deepEqual(view.last()?.marks.exclude, [p.aside]);
  selection.click(asElement(p.sidebar));
  assert.match(view.last()?.notice?.text ?? "", /outside the selected area/);

  selection.review();
  assert.equal(view.last()?.step, "reviewing");
  assert.equal(view.reviews(), 1);
  assert.equal(p.aside.hasAttribute(HIDE_ATTRIBUTE), true);
  assert.equal(p.doc.title, "Quarterly report");
  selection.click(asElement(p.table));
  assert.equal(view.last()?.marks.exclude.length, 1, "clicks do nothing while reviewing");

  selection.back();
  assert.equal(view.last()?.step, "editing");
  assert.equal(p.snapshot(), before);
  selection.review();

  assert.equal(selection.handleKey("Enter"), false);
  assert.equal(selection.handleKey("Escape"), true);
  assert.equal(selection.active, false);
  assert.deepEqual(view.closed, [null]);
  assert.equal(p.snapshot(), before);
  assert.equal(p.head.children.length, 0);
  assert.equal(p.doc.title, "Acme · Reports");
  assert.equal(selection.handleKey("Escape"), false, "Escape does nothing once closed");
});

test("uses every tool, comments and moves blocks, and Escape closes an open editor first", () => {
  const { p, view, selection } = controller(async () => { throw new Error("not used"); });
  selection.start();
  selection.click(asElement(p.article));

  selection.setTool("highlight");
  selection.click(asElement(p.heading));
  selection.setTool("redact");
  selection.click(asElement(p.link));
  selection.setTool("break");
  selection.click(asElement(p.table));
  assert.deepEqual(view.last()?.marks.highlight, [p.heading]);
  assert.deepEqual(view.last()?.marks.redact, [p.link]);
  assert.deepEqual(view.last()?.marks.break, [p.table]);

  selection.setTool("comment");
  selection.click(asElement(p.intro));
  assert.equal(view.last()?.commenting?.element, asElement(p.intro));
  assert.equal(selection.handleKey("Escape"), true);
  assert.equal(view.last()?.commenting, null);
  assert.equal(selection.active, true, "Escape closed only the comment editor");
  selection.click(asElement(p.intro));
  selection.saveComment("Source: annual report");
  assert.equal(view.last()?.comments.get(asElement(p.intro)), "Source: annual report");

  selection.setTool("move");
  selection.click(asElement(p.link));
  assert.equal(view.last()?.moving?.element, asElement(p.intro));
  assert.equal(view.last()?.moving?.canMoveUp, true);
  selection.moveBlock(-1);
  selection.moveBlock(-1);
  assert.equal(view.last()?.moving?.canMoveUp, false);
  assert.equal(view.last()?.reordered, true);
  selection.handleKey("Escape");
  assert.equal(view.last()?.moving, null);

  selection.undo();
  selection.undo();
  assert.equal(view.last()?.reordered, false);
  selection.restoreAll();
  assert.equal(view.last()?.hasChanges, false);
  selection.cancel();
  assert.deepEqual(view.closed, [null]);
});

test("navigates with the keyboard and acts on the outlined element", () => {
  const { p, view, selection } = controller(async () => { throw new Error("not used"); });
  selection.start();
  selection.navigate("next");
  assert.equal(view.last()?.hovered, asElement(p.main), "starts at the main content");
  assert.equal(view.last()?.keyboard, true);
  selection.navigate("child");
  assert.equal(view.last()?.hovered, asElement(p.article));
  selection.activate();
  assert.equal(view.last()?.step, "editing");
  assert.equal(selection.target, asElement(p.article));

  selection.navigate("next");
  assert.equal(view.last()?.hovered, asElement(p.heading), "inside the selection, starts at its first part");
  selection.navigate("next");
  selection.activate();
  assert.deepEqual(view.last()?.marks.exclude, [p.intro]);
  assert.equal(view.revealed.length, 4, "each move scrolls the outlined element into view");
  selection.cancel();
});

test("cancels before and after choosing, and offers the main content without a mouse", () => {
  const { p, view, selection } = controller(async () => { throw new Error("not used"); });
  selection.start();
  selection.cancel();
  assert.deepEqual(view.closed, [null]);

  selection.start();
  selection.useMainContent();
  assert.equal(selection.target, asElement(p.main));
  selection.expand();
  assert.equal(selection.target, asElement(p.body));
  selection.repick();
  assert.equal(view.last()?.step, "picking");
  assert.equal(selection.target, null);
  selection.click(asElement(p.article));
  assert.match(selection.start().message, /already open/);
  selection.cancel();
  assert.equal(view.closed.length, 2);
});

test("saves the prepared page with the chosen file name and restores it afterwards", async () => {
  const requests: Sent[] = [];
  let preparedDuringCapture = false;
  const { p, view, selection } = controller(async (request) => {
    requests.push(request);
    preparedDuringCapture = p.header.hasAttribute(HIDE_ATTRIBUTE) && p.doc.title === "Q3 summary";
    return { success: true, message: "PDF download started." };
  });
  const before = p.snapshot();

  selection.start();
  selection.click(asElement(p.article));
  selection.setTitle("Q3 summary");
  assert.equal(view.last()?.fileName, "Q3 summary.pdf", "the file name follows the title until edited");
  selection.setFileName("board/pack.pdf");
  selection.setTitle("Q3 summary");
  assert.equal(view.last()?.fileBase, "board/pack");
  assert.equal(view.last()?.fileName, "board pack.pdf");
  await selection.save();

  assert.deepEqual(requests, [{ action: "exportSelectionPDF", fileName: "board pack.pdf" }]);
  assert.equal(preparedDuringCapture, true);
  assert.deepEqual(view.hidden, [true, false]);
  assert.deepEqual(view.closed, [{ kind: "success", text: "PDF download started." }]);
  assert.equal(p.snapshot(), before);
  assert.equal(p.doc.title, "Acme · Reports");
  assert.equal(selection.active, false);
});

test("saves images, text recognition, areas and documents in the chosen format", async () => {
  const requests: Sent[] = [];
  const documents: string[] = [];
  const { p, view, selection, copied } = controller(async (request) => {
    requests.push(request);
    return { success: true, message: "Done." };
  }, { saveDocument: async (format, name) => { documents.push(`${format}:${name}`); return { success: true, message: "Saved." }; } });
  const before = p.snapshot();

  selection.start();
  selection.click(asElement(p.article));
  selection.review();
  selection.setFormat("png");
  assert.equal(view.last()?.fileName, "Quarterly report.png");
  await selection.save();
  assert.deepEqual(requests.at(-1), { action: "captureSelectionImage", kind: "png", fileName: "Quarterly report.png" });

  selection.start();
  selection.click(asElement(p.article));
  selection.setTool("redact");
  selection.click(asElement(p.link));
  selection.review();
  await selection.copyMarkdown();
  assert.deepEqual(copied, ["# Quarterly report"]);
  assert.equal(view.last()?.notice?.kind, "success");
  selection.setFormat("docx");
  await selection.save();
  assert.deepEqual(documents, ["docx:Quarterly report.docx"]);
  assert.equal(p.snapshot(), before, "documents are built without the page being changed");

  selection.start("area");
  assert.equal(view.last()?.step, "drawing");
  selection.areaDrawn({ x: 10, y: 20, width: 4, height: 4 });
  assert.match(view.last()?.notice?.text ?? "", /larger area/);
  selection.areaDrawn({ x: 10.4, y: 20, width: 300, height: 200.6 });
  assert.equal(view.last()?.step, "area");
  assert.deepEqual(view.last()?.formats, ["png", "pdf", "ocr"]);
  selection.setFormat("docx");
  assert.equal(view.last()?.format, "png", "documents are not offered for drawn areas");
  selection.setFormat("ocr");
  await selection.save();
  assert.deepEqual(requests.at(-1), { action: "captureSelectionImage", kind: "ocr", fileName: "Acme · Reports - area.png", rect: { x: 10, y: 20, width: 300, height: 201 } });
});

test("restores the page and returns to editing when the capture fails", async () => {
  const failures: Array<[() => Promise<unknown>, RegExp, number?]> = [
    [async () => ({ success: false, message: "PDF capture failed: Printing failed" }), /Printing failed/],
    [async () => { throw new Error("Extension context invalidated."); }, /could not reach the extension/],
    [async () => "unexpected", /invalid response/],
    [() => new Promise(() => undefined), /took too long/, 5]
  ];
  for (const [send, message, timeoutMs] of failures) {
    const { p, view, selection } = controller(send, timeoutMs === undefined ? {} : { timeoutMs });
    const before = p.snapshot();
    selection.start();
    selection.click(asElement(p.article));
    selection.click(asElement(p.table));
    selection.setTool("redact");
    selection.click(asElement(p.link));
    selection.review();

    const saving = selection.save();
    assert.equal(selection.currentStep, "saving");
    selection.handleKey("Escape");
    selection.cancel();
    assert.equal(p.header.hasAttribute(HIDE_ATTRIBUTE), true, "Escape cannot interrupt a capture");
    await saving;

    assert.equal(p.snapshot(), before, String(message));
    assert.equal(p.head.children.length, 0);
    assert.equal(p.doc.title, "Acme · Reports");
    assert.deepEqual(view.hidden, [true, false]);
    assert.equal(view.last()?.step, "editing");
    assert.equal(view.last()?.notice?.kind, "error");
    assert.match(view.last()?.notice?.text ?? "", message);
    assert.deepEqual(view.last()?.marks.exclude, [p.table], "the choices are kept for another try");
    assert.deepEqual(view.closed, []);
  }
});

test("reports a page that cannot be prepared without sending anything", async () => {
  let sent = 0;
  const { p, view, selection } = controller(async () => { sent++; return { success: true, message: "" }; });
  selection.start();
  selection.click(asElement(p.article));
  p.sidebar.failOnSetAttribute = true;
  await selection.save();
  assert.equal(sent, 0);
  assert.equal(view.last()?.step, "editing");
  assert.match(view.last()?.notice?.text ?? "", /could not be prepared/);
  p.sidebar.failOnSetAttribute = false;
  assert.equal(p.main.hasAttribute(KEEP_ATTRIBUTE), false);
});

test("the background accepts captures only from extension pages or the page's own top frame", async () => {
  const calls: Array<[number, object | undefined]> = [];
  const images: Array<[number, SelectionImageRequest]> = [];
  const services = {
    savePDF: async (tabId: number, options?: object): Promise<ExportResult> => {
      calls.push([tabId, options]);
      return { success: true, message: "PDF download started." };
    },
    preferences: async () => ({ ...DEFAULT_PREFERENCES, pdfHeaderFooter: true }),
    handleImage: async (tabId: number, request: SelectionImageRequest): Promise<ExportResult> => {
      images.push([tabId, request]);
      return { success: true, message: "Image download started." };
    },
    handleTab: async (): Promise<ExportResult> => ({ success: true, message: "Tab handled." })
  };
  const runtimeId = "web2doc";
  const selectionRequest = { action: "exportSelectionPDF", fileName: "Report.pdf" };
  const imageRequest = { action: "captureSelectionImage", kind: "png", fileName: "Report.png" };
  const page = { id: runtimeId, tab: { id: 9 }, frameId: 0 };

  assert.ok(routeBackgroundMessage({ action: "exportPDF", tabId: 3 }, { id: runtimeId }, runtimeId, services));
  await routeBackgroundMessage(selectionRequest, page, runtimeId, services);
  await routeBackgroundMessage(imageRequest, page, runtimeId, services);
  assert.deepEqual(calls, [[3, undefined], [9, { fileName: "Report.pdf", headerFooter: true, qrCode: false }]]);
  assert.deepEqual(images, [[9, imageRequest]]);
  assert.deepEqual(await routeBackgroundMessage({ action: "saveArchive", tabId: 4 }, { id: runtimeId }, runtimeId, services), { success: true, message: "Tab handled." });

  assert.equal(routeBackgroundMessage(selectionRequest, { ...page, frameId: 2 }, runtimeId, services), undefined);
  assert.equal(routeBackgroundMessage(selectionRequest, { ...page, id: "other" }, runtimeId, services), undefined);
  assert.equal(routeBackgroundMessage(selectionRequest, { id: runtimeId }, runtimeId, services), undefined);
  assert.equal(routeBackgroundMessage({ action: "exportPDF", tabId: 3 }, page, runtimeId, services), undefined, "a page cannot ask for another tab");
  assert.equal(routeBackgroundMessage({ action: "saveArchive", tabId: 3 }, page, runtimeId, services), undefined);
  assert.equal(routeBackgroundMessage({ ...imageRequest, kind: "gif" }, page, runtimeId, services), undefined);

  const failing = routeBackgroundMessage(selectionRequest, page, runtimeId, {
    ...services,
    savePDF: async () => { throw new Error("Service worker stopped"); }
  });
  assert.deepEqual(await failing, { success: false, message: "PDF capture failed: Service worker stopped" });
});

test("validates selection requests and keeps typed file names clean", () => {
  assert.equal(isSelectionPDFRequest({ action: "exportSelectionPDF", fileName: "a.pdf" }), true);
  for (const value of [null, {}, { action: "exportSelectionPDF" }, { action: "exportSelectionPDF", fileName: 4 },
    { action: "exportSelectionPDF", fileName: "x".repeat(301) }, { action: "exportPDF", fileName: "a" }]) {
    assert.equal(isSelectionPDFRequest(value), false);
  }
  assert.equal(isSelectionImageRequest({ action: "captureSelectionImage", kind: "pdf", fileName: "a", rect: { x: 0, y: 0, width: 5, height: 5 } }), true);
  assert.equal(isSelectionImageRequest({ action: "captureSelectionImage", kind: "pdf", fileName: "a", rect: { x: 0, y: 0, width: 0, height: 5 } }), false);
  assert.equal(pdfFileName("Report.PDF"), "Report.pdf");
  assert.equal(pdfFileName("board/pack"), "board pack.pdf");
  assert.equal(pdfFileName(".pdf"), "page.pdf");
});

test("the background saves files built by the page's own top frame, with clean names and known types only", async () => {
  const { safeDownloadName } = await import("../src/background/BackgroundRouter.ts");
  const saved: unknown[] = [];
  const services = {
    download: async (request: unknown): Promise<ExportResult> => { saved.push(request); return { success: true, message: "Download started." }; },
    preferences: async () => DEFAULT_PREFERENCES
  };
  const page = { id: "web2doc", tab: { id: 4 }, frameId: 0 };
  const request = { action: "downloadFile", fileName: "Sales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: "UEsDBA==" };
  assert.deepEqual(await routeBackgroundMessage(request, page, "web2doc", services), { success: true, message: "Download started." });
  assert.deepEqual(saved, [request]);
  assert.equal(routeBackgroundMessage({ ...request, mimeType: "application/x-msdownload" }, page, "web2doc", services), undefined, "only export types");
  assert.equal(routeBackgroundMessage(request, { ...page, frameId: 1 }, "web2doc", services), undefined, "only the top frame");
  assert.equal(routeBackgroundMessage(request, { id: "web2doc" }, "web2doc", services), undefined, "extension pages download by themselves");
  const traversal = safeDownloadName("../../evil/Report?.xlsx");
  assert.equal(/[\\/]/.test(traversal), false, "no folders");
  assert.equal(traversal, ".. evil Report.xlsx");
  assert.equal(safeDownloadName("notes"), "notes");
  assert.equal(safeDownloadName(".md"), "page.md");
});
