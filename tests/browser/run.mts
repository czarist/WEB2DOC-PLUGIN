// Real-browser verification of every roadmap stage with the built extension in Chromium:
// clicks, keys and drags are sent through the DevTools protocol, and every downloaded file is
// then opened by independent readers (tests/browser/check_files.py).
// Usage: npm run build && npm run test:browser
// Set CHROME_PATH to choose the browser; Playwright's Chromium is used when it is installed.
import { cpSync, existsSync, mkdtempSync, readFileSync as readText, writeFileSync as writeText } from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Browser, sleep } from "./cdp.mts";
import { FIXED, SIMPLE, WIDGETS } from "./pages.mts";

const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");
if (!existsSync(path.join(dist, "manifest.json"))) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(1);
}
const out = process.argv[2] ?? mkdtempSync(path.join(os.tmpdir(), "web2doc-browser-"));
// Batch export needs the optional "tabs" permission, which a headless browser cannot grant
// through its prompt; a copy of the build grants it at install time.
const batchDist = path.join(out, "dist-batch");
cpSync(dist, batchDist, { recursive: true });
const batchManifest = JSON.parse(readText(path.join(batchDist, "manifest.json"), "utf8")) as { permissions: string[]; optional_permissions: string[] };
batchManifest.permissions.push("tabs");
batchManifest.optional_permissions = [];
writeText(path.join(batchDist, "manifest.json"), JSON.stringify(batchManifest, null, 2));
console.log(`Output: ${out}`);
const PNG_A = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGOQj77x//9/AAviBFAuKxxbAAAAAElFTkSuQmCC";
const PNG_B = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const server = createServer((req, res) => {
  const url = req.url ?? "";
  if (url.endsWith(".png")) {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from(url.includes("logo") ? PNG_A : PNG_B, "base64"));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(url.startsWith("/fixed") ? FIXED : url.startsWith("/widgets") ? WIDGETS : SIMPLE);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const results: Array<[string, boolean, string?]> = [];
const files: Array<Record<string, unknown>> = [];
function check(name: string, ok: boolean, detail?: unknown) {
  const text = detail === undefined ? undefined : typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push([name, ok, text]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${text ? ` — ${text.slice(0, 220)}` : ""}`);
}
const expectFile = (name: string, file: string | undefined, expectations: Record<string, unknown>) => {
  check(`${name}: file downloaded`, !!file, file ? path.basename(file) : "missing");
  if (file) files.push({ name, file, ...expectations });
};

const b = new Browser(path.join(out, "profile"), path.join(out, "downloads"));
const pageState = (session: string) => b.evaluate(session, `({
  marks: document.querySelectorAll("[data-web2doc-hide],[data-web2doc-keep],[data-web2doc-target],[data-web2doc-redact],[data-web2doc-comment],[data-web2doc-highlight],[data-web2doc-arrow],[data-web2doc-break],[data-web2doc-order],style[data-web2doc-style]").length,
  host: !!document.querySelector("web2doc-selection"),
  title: document.title,
  url: location.href
})`);
const start = (tabId: number, mode = "element") => b.evaluate(b.worker, `chrome.tabs.sendMessage(${tabId}, { action: "startSelection", mode: "${mode}" }).then((r) => r, (e) => ({ rejected: e.message }))`);
const clickPopup = async (popup: string, selector: string) => b.evaluate(popup, `document.querySelector(${JSON.stringify(selector)}).click(); true`);
const popupStatus = async (popup: string, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    const state = await b.evaluate(popup, `({ state: document.getElementById("exportStatus").dataset.state, text: document.getElementById("exportStatus").textContent })`).catch(() => ({ state: "closed", text: "(popup closed)" }));
    text = state.text;
    if (state.state !== "busy") return state as { state: string; text: string };
    await sleep(200);
  }
  return { state: "timeout", text };
};

try {
  await b.loadExtension(dist);
  console.log("extension", b.extensionId);

  // ---------- Stage 1: selection on the simple page ----------
  const restricted = await b.openPage("chrome://version/");
  let popup = await b.openPopup();
  if (popup) {
    await clickPopup(popup, "#selectPDF");
    const status = await popupStatus(popup);
    check("incompatible tab: the popup explains it", /can't be accessed/.test(status.text), status.text);
    await b.shot(popup, path.join(out, "popup-restricted.png"));
  } else check("popup opens", false);
  void restricted;

  const simple = await b.openPage(`${origin}/simple`);
  const s = simple.session;
  popup = await b.openPopup();
  await b.shot(popup!, path.join(out, "popup-light.png"));
  await clickPopup(popup!, "#selectPDF");
  await sleep(600);
  let state = await pageState(s);
  check("popup opens the selection tools and closes", state.host && state.marks === 0, state);

  // Keyboard: main content, then its first child (the article), then Enter.
  await b.key(s, "ArrowDown", 40);
  await b.key(s, "ArrowRight", 39);
  await b.shot(s, path.join(out, "s1-keyboard.png"));
  await b.key(s, "Enter", 13);
  check("keyboard: arrows and Enter choose the article", (await b.overlayText(s, ".selected-name")) === "article#story", await b.overlayText(s, ".selected-name"));

  await b.clickSelector(s, "#ad");
  await b.clickOverlay(s, '[data-tool="redact"]');
  await b.clickSelector(s, "#secret", { edge: true });
  await b.clickOverlay(s, '[data-tool="comment"]');
  await b.clickSelector(s, "#intro", { edge: true });
  await b.typeOverlay(s, 'textarea[name="comment"]', "REVIEW THIS NOTE");
  await b.clickOverlay(s, '[data-command="save-comment"]');
  await b.clickOverlay(s, '[data-tool="break"]');
  await b.clickSelector(s, "#numbers", { edge: true });
  await b.clickOverlay(s, '[data-tool="highlight"]');
  await b.clickSelector(s, "#story h1");
  await b.clickOverlay(s, '[data-tool="arrow"]');
  await b.clickSelector(s, "#end");
  await b.clickOverlay(s, '[data-tool="move"]');
  await b.clickSelector(s, "#end");
  await b.clickOverlay(s, '[data-command="move-up"]');
  await b.clickOverlay(s, '[data-command="move-up"]');
  await b.clickOverlay(s, '[data-command="move-done"]');
  await b.typeOverlay(s, 'input[name="title"]', "Edited Story Title");
  const summary = await b.overlayText(s, ".change-count");
  check("tools: every change is listed", /1 excluded.*1 highlight.*1 arrow.*1 comment.*1 redacted.*1 page break.*reordered/.test(summary), summary);
  check("editing does not change the page", (await pageState(s)).marks === 0);
  await b.shot(s, path.join(out, "s1-editing.png"));

  await b.clickOverlay(s, '[data-command="review"]');
  await sleep(300);
  const review = await b.evaluate(s, `({ secret: document.querySelector("#secret").textContent, href: document.querySelector("#secret a").getAttribute("href"),
    hidden: ["header", "#sidebar", "footer", "#ad"].map((q) => getComputedStyle(document.querySelector(q)).display), title: document.title })`);
  check("review: redaction, hidden parts and title applied", !review.secret.includes("9876") && review.href === null && review.hidden.every((d: string) => d === "none") && review.title === "Edited Story Title", review);
  await b.shot(s, path.join(out, "s1-review.png"));

  let before = b.snapshotDownloads();
  await sleep(600);
  await b.clickOverlay(s, '[data-command="save"]');
  expectFile("selection PDF with every tool", await b.download(before, ".pdf"), {
    kind: "pdf", title: "Edited Story Title", minPages: 2,
    contains: ["Simple Story Heading", "REVIEW THIS NOTE", "kept link", "ARTICLE INTRO TEXT"],
    absent: ["ADVERTISEMENT", "SECRET-ACCOUNT", "9876", "private portal", "SIDEBAR NAV", "SITE HEADER", "SITE FOOTER"],
    absentUris: ["secret.example"], order: ["ARTICLE END TEXT", "Paragraph 2."]
  });
  await sleep(500);
  state = await pageState(s);
  const restoredSecret = await b.evaluate(s, `({ text: document.querySelector("#secret").textContent, href: document.querySelector("#secret a").getAttribute("href"), order: [...document.querySelector("#story").children].map((e) => e.id || e.tagName).join(",") })`);
  check("page restored after saving: attributes, text, links, order, title", state.marks === 0 && state.title === "Simple test page"
    && restoredSecret.text.includes("SECRET-ACCOUNT-9876") && restoredSecret.href === "https://secret.example/acct-9876", { state, restoredSecret });

  // Other formats of a selection.
  for (const [format, extension, expectations] of [
    ["markdown", ".md", { kind: "markdown", contains: ["# Simple Story Heading", "[kept link](https://example.com/kept-link)", "| Name | Value |"], absent: ["SITE HEADER"] }],
    ["json", ".json", { kind: "json", contains: ["\"schemaVersion\": 1", "Simple Story Heading"] }],
    ["docx", ".docx", { kind: "docx", contains: ["Simple Story Heading", "ARTICLE INTRO TEXT"], titleStyle: "Simple Story Heading", tables: 1 }],
    ["png", ".png", { kind: "png", minWidth: 1000 }]
  ] as const) {
    await start(simple.tabId);
    await b.clickSelector(s, "#story", { edge: true });
    await b.clickOverlay(s, '[data-command="review"]');
    await b.clickOverlay(s, `[data-format="${format}"]`);
    before = b.snapshotDownloads();
    await sleep(600);
    await b.clickOverlay(s, '[data-command="save"]');
    expectFile(`selection as ${format}`, await b.download(before, extension), expectations);
    await sleep(400);
    check(`page restored after saving ${format}`, (await pageState(s)).marks === 0);
  }

  // Copy Markdown from the review (clipboard support varies in headless browsers).
  await start(simple.tabId);
  await b.clickSelector(s, "#story", { edge: true });
  await b.clickOverlay(s, '[data-command="review"]');
  await b.clickOverlay(s, '[data-command="copy"]');
  await sleep(400);
  const copyNotice = await b.overlayText(s, ".notice");
  check("copy Markdown reports its result", /copied|did not allow copying/.test(copyNotice), copyNotice);
  await b.key(s, "Escape", 27);
  state = await pageState(s);
  check("Escape closes the tools and restores the page", !state.host && state.marks === 0 && state.title === "Simple test page", state);

  // Failure: the capture is refused; the page is restored and the panel stays open.
  await b.evaluate(b.worker, `globalThis.__attach = chrome.debugger.attach; chrome.debugger.attach = async () => { throw new Error("Simulated failure"); }; true`);
  await start(simple.tabId);
  await b.clickSelector(s, "#story", { edge: true });
  await b.clickOverlay(s, '[data-tool="redact"]');
  await b.clickSelector(s, "#secret", { edge: true });
  await b.clickOverlay(s, '[data-command="review"]');
  await sleep(600);
  await b.clickOverlay(s, '[data-command="save"]');
  await sleep(1500);
  state = await pageState(s);
  const failureText = await b.overlayText(s, ".notice");
  check("failed capture restores the page and keeps the tools open", state.host && state.marks === 0 && state.title === "Simple test page", state);
  check("failed capture shows an error", /can't be captured/.test(failureText), failureText);
  await b.shot(s, path.join(out, "s1-failure.png"));
  await b.clickOverlay(s, '[data-command="cancel"]');
  await b.evaluate(b.worker, `chrome.debugger.attach = globalThis.__attach; true`);

  // Area: drag a rectangle, save as PNG and as an image PDF.
  for (const format of ["png", "pdf"] as const) {
    await start(simple.tabId, "area");
    await b.evaluate(s, "window.scrollTo(0, 0)");
    await sleep(200);
    await b.drag(s, [160, 120], [560, 360]);
    await sleep(300);
    if (format === "pdf") await b.clickOverlay(s, '[data-format="pdf"]');
    if (format === "png") await b.shot(s, path.join(out, "s1-area.png"));
    before = b.snapshotDownloads();
    await sleep(600);
    await b.clickOverlay(s, '[data-command="save"]');
    expectFile(`area as ${format}`, await b.download(before, `.${format}`), format === "png" ? { kind: "png", width: 800, height: 480 } : { kind: "pdf", pages: 1, imageOnly: true });
  }

  // ---------- Fixed and sticky elements (dark theme) ----------
  const fixed = await b.openPage(`${origin}/fixed`, true);
  const f = fixed.session;
  await start(fixed.tabId);
  await b.clickSelector(f, "#target", { edge: true });
  await b.clickSelector(f, "#note");
  await b.shot(f, path.join(out, "fixed-editing-dark.png"));
  await b.clickOverlay(f, '[data-command="review"]');
  await sleep(300);
  const fixedHidden = await b.evaluate(f, `[".topbar", ".cookie", ".chat", ".toc"].map((q) => getComputedStyle(document.querySelector(q)).display)`);
  check("fixed and sticky elements outside the selection are hidden", fixedHidden.every((d: string) => d === "none"), fixedHidden);
  before = b.snapshotDownloads();
  await sleep(600);
  await b.clickOverlay(f, '[data-command="save"]');
  expectFile("fixed page selection PDF", await b.download(before, ".pdf"), {
    kind: "pdf", contains: ["TARGET SECTION TEXT", "TARGET SECTION END"], absent: ["EXCLUDED NOTE", "FIXED TOPBAR", "COOKIE BANNER", "CHAT BUBBLE", "STICKY TOC", "Intro Section"]
  });
  await sleep(500);
  const fixedAfter = await b.evaluate(f, `({ marks: document.querySelectorAll("[data-web2doc-hide],[data-web2doc-keep]").length, topbar: getComputedStyle(document.querySelector(".topbar")).position, toc: getComputedStyle(document.querySelector(".toc")).position, styled: [...document.querySelectorAll("body [style]")].length })`);
  check("fixed page restored exactly", fixedAfter.marks === 0 && fixedAfter.topbar === "fixed" && fixedAfter.toc === "sticky" && fixedAfter.styled === 0, fixedAfter);

  // Whole page with header, footer and QR code from the preferences.
  await b.evaluate(b.worker, `chrome.storage.local.set({ preferences: { fileNamePattern: "{title} - {date}", pdfHeaderFooter: true, pdfQrCode: true, defaultPresetId: "clean-article", keepHistory: true } })`);
  popup = await b.openPopup();
  await b.shot(popup!, path.join(out, "popup-dark.png"));
  before = b.snapshotDownloads();
  await clickPopup(popup!, "#exportPDF");
  const wholeStatus = await popupStatus(popup!);
  check("whole-page PDF from the popup", wholeStatus.state === "success", wholeStatus.text);
  expectFile("whole page PDF with header, footer and QR", await b.download(before, ".pdf"), {
    kind: "pdf", contains: ["FIXED TOPBAR TEXT", "Intro Section", "Page 1 of", "127.0.0.1"], nameMatches: "Fixed elements page - \\d{4}-\\d{2}-\\d{2}\\.pdf", absent: ["download started"]
  });
  await b.evaluate(b.worker, `chrome.storage.local.set({ preferences: { fileNamePattern: "{title}", pdfHeaderFooter: false, pdfQrCode: false, defaultPresetId: "clean-article", keepHistory: true } })`);
  check("whole-page capture leaves no style attributes", (await b.evaluate(f, `document.querySelectorAll("body [style]").length`)) === 0);

  // ---------- Stage 2-4, 8: widgets page ----------
  const widgets = await b.openPage(`${origin}/widgets`);
  const w = widgets.session;
  popup = await b.openPopup();
  await clickPopup(popup!, "#exportCSV");
  await sleep(600);
  await b.shot(popup!, path.join(out, "popup-tables.png"));
  const highlights = await b.overlayNode(w, ".box", "web2doc-table-highlight");
  check("table picker outlines the tables on the page", !!highlights);
  await clickPopup(popup!, "#toggleAllTables");
  before = b.snapshotDownloads();
  await clickPopup(popup!, "#exportSelectedTables");
  const xlsxStatus = await popupStatus(popup!);
  check("Excel export from the picker", xlsxStatus.state === "success", xlsxStatus.text);
  expectFile("tables as Excel", await b.download(before, ".xlsx"), { kind: "xlsx", sheets: ["Vendas por região", "Equipe"] });
  await clickPopup(popup!, 'input[name="tableFormat"][value="csv"]');
  before = b.snapshotDownloads();
  await clickPopup(popup!, "#exportSelectedTables");
  await popupStatus(popup!);
  expectFile("tables as CSV (second download from the same page)", await b.download(before, ".csv"), { kind: "csv", contains: ["\"007\"", "\"R$ 1.299,90\""] });

  popup = await b.openPopup();
  for (const [selector, extension, expectations] of [
    ["#exportInventory", ".xlsx", { kind: "xlsx", sheets: ["Links", "Metadata"], name: "inventory" }],
    ['[data-document="markdown"]', ".md", { kind: "markdown", contains: ["# Painel de vendas", "| Código | Região | Total | Data | Fórmula |", "![Logo da empresa]"] }],
    ['[data-document="json"]', ".json", { kind: "json", contains: ["\"language\": \"pt-BR\"", "Vendas por região"] }],
    ['[data-document="docx"]', ".docx", { kind: "docx", contains: ["Painel de vendas", "Vendas por região"], tables: 2, images: 2 }],
    ['[data-tab-action="exportImages"]', ".zip", { kind: "zip", entries: ["logo.png", "chart.png", "sources.txt"] }],
    ['[data-tab-action="saveArchive"]', ".mhtml", { kind: "mhtml", contains: ["Painel de vendas"] }]
  ] as const) {
    before = b.snapshotDownloads();
    await clickPopup(popup!, selector);
    const status = await popupStatus(popup!);
    check(`popup ${selector}`, status.state === "success", status.text);
    expectFile(`popup ${selector}`, await b.download(before, extension), expectations);
  }

  // Shadow DOM: choose an element inside an open shadow root, grow, exclude, save.
  await start(widgets.tabId);
  await b.evaluate(w, `document.querySelector("#card").scrollIntoView({ block: "center" })`);
  const shadowPoint = await b.evaluate(w, `(() => { const r = document.querySelector("#card").shadowRoot.querySelector("#shadow-text").getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await b.mouse(w, shadowPoint.x, shadowPoint.y);
  await sleep(200);
  const shadowChoice = await b.overlayText(w, ".selected-name");
  await b.clickOverlay(w, '[data-command="expand"]');
  const shadowParent = await b.overlayText(w, ".selected-name");
  check("shadow DOM: an element inside a shadow root can be chosen and grown", shadowChoice === "p#shadow-text" && shadowParent === "div#inner", { shadowChoice, shadowParent });
  const dropPoint = await b.evaluate(w, `(() => { const r = document.querySelector("#card").shadowRoot.querySelector("#shadow-drop").getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await b.mouse(w, dropPoint.x, dropPoint.y);
  await b.clickOverlay(w, '[data-command="review"]');
  await sleep(300);
  before = b.snapshotDownloads();
  await sleep(600);
  await b.clickOverlay(w, '[data-command="save"]');
  expectFile("shadow DOM selection PDF", await b.download(before, ".pdf"), { kind: "pdf", contains: ["SHADOW INNER TEXT"], absent: ["SHADOW DROP TEXT", "Vendas por", "Equipe"] });
  await sleep(400);
  check("shadow DOM: page and shadow root restored", (await b.evaluate(w, `document.querySelector("#card").shadowRoot.querySelectorAll("[data-web2doc-hide],[data-web2doc-keep],style[data-web2doc-style]").length`)) === 0);

  // Frames: the frame is chosen through a cover drawn over it.
  await start(widgets.tabId);
  await b.clickSelector(w, "#frame");
  check("frames: a frame can be chosen", (await b.overlayText(w, ".selected-name")) === "iframe#frame", await b.overlayText(w, ".selected-name"));
  await b.clickOverlay(w, '[data-command="review"]');
  before = b.snapshotDownloads();
  await sleep(600);
  await b.clickOverlay(w, '[data-command="save"]');
  expectFile("frame selection PDF", await b.download(before, ".pdf"), { kind: "pdf", contains: ["IFRAME INNER TEXT"], absent: ["Vendas por", "Equipe"] });

  // OCR of the visible area.
  await b.evaluate(w, "window.scrollTo(0, 0)");
  popup = await b.openPopup();
  await clickPopup(popup!, '[data-tab-action="ocrVisible"]');
  const ocrStatus = await popupStatus(popup!);
  check("OCR opens from the popup", ocrStatus.state === "success" || ocrStatus.state === "closed", ocrStatus.text);
  const ocrTarget = await b.findTarget((url) => url.endsWith("/ocr.html"), 10000);
  if (ocrTarget) {
    const o = await b.attach(ocrTarget.targetId);
    let recognized = "";
    let status = "";
    for (let i = 0; i < 240 && !/Recognized d+ words/.test(status); i++) {
      await sleep(500);
      ({ recognized, status } = await b.evaluate(o, `({ recognized: document.getElementById("ocrText").value, status: document.getElementById("ocrStatus").textContent })`));
      if (/failed/i.test(status)) break;
    }
    check("OCR recognizes text locally", /Painel de venda/.test(recognized) && /Norte/.test(recognized) && /Sul/.test(recognized), `${status} ${recognized.replace(/s+/g, " ").slice(0, 160)}`);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false }, o);
    await b.shot(o, path.join(out, "ocr-page.png"));
  } else check("OCR page opened", false);

  // Compare captures (the OCR page opened in front, so bring the page back).
  await b.send("Target.activateTarget", { targetId: widgets.targetId });
  popup = await b.openPopup();
  await clickPopup(popup!, '[data-tab-action="compareCapture"]');
  const firstCompare = await popupStatus(popup!);
  check("compare: first capture is saved", /Saved this page/.test(firstCompare.text), firstCompare.text);
  await b.evaluate(w, `document.querySelector("h1").textContent = "Painel de vendas atualizado"; true`);
  await b.send("Target.activateTarget", { targetId: widgets.targetId });
  popup = await b.openPopup();
  await clickPopup(popup!, '[data-tab-action="compareCapture"]');
  await popupStatus(popup!);
  const compareTarget = await b.findTarget((url) => url.endsWith("/compare.html"), 10000);
  if (compareTarget) {
    const c = await b.attach(compareTarget.targetId);
    await sleep(800);
    const stats = await b.evaluate(c, `document.getElementById("compareStats").textContent`);
    check("compare: changes between captures are listed", /^1 line added, 1 removed/.test(stats), stats);
    await b.shot(c, path.join(out, "compare-page.png"));
  } else check("compare page opened", false);

  // ---------- Stage 5: presets, options, history ----------
  await b.send("Target.activateTarget", { targetId: simple.targetId });
  popup = await b.openPopup();
  await b.evaluate(popup!, `document.getElementById("presetSelect").value = "clean-article"; true`);
  before = b.snapshotDownloads();
  await clickPopup(popup!, "#runPreset");
  const presetStatus = await popupStatus(popup!);
  check("preset: clean article", presetStatus.state === "success", presetStatus.text);
  expectFile("clean article preset PDF", await b.download(before, ".pdf"), {
    kind: "pdf", contains: ["Simple Story Heading", "SECRET-ACCOUNT-9876"], absent: ["SIDEBAR NAV", "SITE HEADER", "SITE FOOTER"]
  });
  check("preset: page restored", (await pageState(s)).marks === 0);

  const options = await b.openPage(`chrome-extension://${b.extensionId}/options.html`);
  await sleep(800);
  const presetCount = await b.evaluate(options.session, `document.querySelectorAll("#presetList li").length`);
  await b.evaluate(options.session, `document.getElementById("presetName").value = "My Markdown"; document.getElementById("presetScope").value = "main"; document.getElementById("presetScope").dispatchEvent(new Event("change")); document.getElementById("presetFormat").value = "markdown"; document.querySelector("#presetForm button[type=submit]").click(); true`);
  await sleep(600);
  const afterAdd = await b.evaluate(options.session, `({ presets: document.querySelectorAll("#presetList li").length, history: document.querySelectorAll("#historyTable tbody tr").length, shortcuts: document.querySelectorAll("#shortcutList tr").length })`);
  check("options: built-in presets listed and a new preset added", presetCount === 5 && afterAdd.presets === 6, { presetCount, ...afterAdd });
  check("options: history lists recent exports", afterAdd.history >= 10, afterAdd);
  check("options: shortcuts listed", afterAdd.shortcuts >= 3, afterAdd);
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 1600, deviceScaleFactor: 1, mobile: false }, options.session);
  await b.shot(options.session, path.join(out, "options-light.png"));
  const menus = await b.evaluate(b.worker, `new Promise((resolve) => chrome.contextMenus.update("web2doc-pdf", {}, () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : "exists")))`);
  check("context menu items exist", menus === "exists", menus);
  const commands = await b.evaluate(b.worker, `chrome.commands.getAll().then((all) => all.map((c) => c.name + "=" + c.shortcut))`);
  check("keyboard shortcuts registered", commands.includes("save-page-pdf=Alt+Shift+F") && commands.includes("save-part=Alt+Shift+S"), commands);

  // The batch page asks for the optional tabs permission before listing tabs.
  const batchPage = await b.openPage(`chrome-extension://${b.extensionId}/batch.html`);
  await sleep(600);
  const permissionShown = await b.evaluate(batchPage.session, `!document.getElementById("permissionSection").hidden && document.getElementById("setupSection").hidden`);
  check("batch: asks for the tabs permission first", permissionShown);
} catch (error) {
  check("harness", false, error instanceof Error ? error.stack : String(error));
} finally {
  b.close();
}

// ---------- Stage 7: batch export (optional permission granted in a test copy) ----------
if (batchDist) {
  const bb = new Browser(path.join(out, "profile-batch"), path.join(out, "downloads-batch"));
  try {
    await bb.loadExtension(batchDist);
    await bb.openPage(`${origin}/fixed`);
    await bb.openPage(`${origin}/simple`);
    await bb.openPage(`${origin}/widgets`);
    await bb.openPage("chrome://version/");
    const page = await bb.openPage(`chrome-extension://${bb.extensionId}/batch.html`);
    const p = page.session;
    await sleep(1200);
    const listing = await bb.evaluate(p, `[...document.querySelectorAll("#tabList li")].map((li) => ({ title: li.querySelector(".title")?.textContent, enabled: !li.querySelector("input").disabled }))`);
    check("batch: lists the window's tabs and disables browser pages", listing.length === 5 && listing.filter((t: any) => !t.enabled).length === 2, listing);
    await bb.evaluate(p, `document.getElementById("batchPreset").value = "tables-only"; document.getElementById("batchPreset").dispatchEvent(new Event("change")); true`);
    let before = bb.snapshotDownloads();
    await bb.evaluate(p, `document.getElementById("startBatch").click(); true`);
    const zip = await bb.download(before, ".zip", 90000);
    const batchState = await bb.evaluate(p, `({ status: document.getElementById("progressStatus").textContent, badges: [...document.querySelectorAll("#resultList .badge")].map((b) => b.textContent) })`);
    check("batch: exports the reachable tabs and reports the others", /Exported 2 of 3 tabs/.test(batchState.status), batchState);
    await bb.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false }, p);
    await bb.shot(p, path.join(out, "batch-done.png"));
    expectFile("batch ZIP", zip, { kind: "zip", entryCount: 3, entries: ["report.txt", "Simple test page - tables.xlsx", "Painel de vendas - tables.xlsx"], reportContains: ["Exported: 2 of 3", "FAILED Fixed elements page", "No HTML tables were found"] });

    await bb.evaluate(p, `document.getElementById("restartBatch").click(); true`);
    await sleep(800);
    await bb.evaluate(p, `document.getElementById("batchPreset").value = "full-page"; document.getElementById("batchPreset").dispatchEvent(new Event("change")); document.getElementById("batchOutput").value = "pdf"; true`);
    before = bb.snapshotDownloads();
    await bb.evaluate(p, `document.getElementById("startBatch").click(); true`);
    expectFile("batch combined PDF", await bb.download(before, ".pdf", 120000), { kind: "pdf", contains: ["Simple Story Heading", "Painel de vendas", "FIXED TOPBAR TEXT"], minPages: 3 });
  } catch (error) {
    check("batch harness", false, error instanceof Error ? error.stack : String(error));
  } finally {
    bb.close();
  }
}

server.close();
writeFileSync(path.join(out, "files.json"), JSON.stringify(files, null, 2));
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed\n`);

// The downloaded files are opened with pypdf, openpyxl, python-docx and Pillow.
const checker = spawnSync("python", ["-P", path.join(import.meta.dirname, "check_files.py"), path.join(out, "files.json")], {
  stdio: "inherit",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" }
});
if (checker.error) console.warn("Python was not found; the downloaded files were not checked.");
process.exit(failed || (checker.status ?? 0) !== 0 ? 1 : 0);
