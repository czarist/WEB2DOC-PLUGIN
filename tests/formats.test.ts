import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { buildDocument, findMainContent, type ExtractOptions } from "../src/document/extract.ts";
import { documentText, type PageDocument } from "../src/document/model.ts";
import { dateOrder, dateSerial, decimalSeparator, interpretCell, parseNumber } from "../src/formats/cellValues.ts";
import { createDocx } from "../src/formats/docx.ts";
import { renderJson, renderMarkdown } from "../src/formats/markdown.ts";
import { columnName, createXlsx, sheetNames, xmlText } from "../src/formats/xlsx.ts";
import { readZip } from "../src/formats/zip.ts";

const text = (value: string) => ({ kind: "text" as const, text: value });

test("keeps identifiers and ambiguous values as text and converts values the page language makes clear", () => {
  assert.equal(decimalSeparator("pt-BR"), ",");
  assert.equal(decimalSeparator("de-CH"), ".");
  assert.equal(decimalSeparator("en-US"), ".");
  assert.equal(decimalSeparator(""), null);
  assert.equal(dateOrder("en-US"), "mdy");
  assert.equal(dateOrder("en-GB"), "dmy");
  assert.equal(dateOrder("en"), null);
  assert.equal(dateOrder("pt-BR"), "dmy");

  const pt = { lang: "pt-BR" };
  const en = { lang: "en-US" };
  const unknown = { lang: "" };
  // Without conversion, everything stays text.
  assert.deepEqual(interpretCell("1.234,56", pt, false), text("1.234,56"));
  // Leading zeros and long numbers are identifiers.
  for (const value of ["007", "0123", "01/02", "1234567890123456789", "+0 11 2345"]) assert.equal(interpretCell(value, en, true).kind, "text", value);
  assert.deepEqual(interpretCell("1.234,56", pt, true), { kind: "number", value: 1234.56, format: "general" });
  assert.deepEqual(interpretCell("1,234.56", en, true), { kind: "number", value: 1234.56, format: "general" });
  assert.deepEqual(interpretCell("1.234", pt, true), { kind: "number", value: 1234, format: "general" });
  assert.deepEqual(interpretCell("1,234", unknown, true), text("1,234"), "thousands or decimals depends on the language");
  assert.deepEqual(interpretCell("1.5", pt, true), text("1.5"), "a dot is not a Portuguese decimal separator");
  assert.deepEqual(interpretCell("R$ 1.299,90", pt, true), { kind: "number", value: 1299.9, format: { currency: "R$" } });
  assert.deepEqual(interpretCell("-$12.50", en, true), { kind: "number", value: -12.5, format: { currency: "$" } });
  assert.deepEqual(interpretCell("12,5 €", pt, true), { kind: "number", value: 12.5, format: { currency: "€" } });
  assert.deepEqual(interpretCell("(1,000.00)", en, true), { kind: "number", value: -1000, format: "general" });
  assert.deepEqual(interpretCell("45%", en, true), { kind: "number", value: 0.45, format: "percent" });
  assert.deepEqual(interpretCell("1 234 567", pt, true), { kind: "number", value: 1234567, format: "general" });
  assert.deepEqual(interpretCell("2026-11-05", unknown, true), { kind: "date", serial: dateSerial(2026, 11, 5), withTime: false });
  assert.deepEqual(interpretCell("05/11/2026", pt, true), { kind: "date", serial: dateSerial(2026, 11, 5), withTime: false });
  assert.deepEqual(interpretCell("11/05/2026", en, true), { kind: "date", serial: dateSerial(2026, 11, 5), withTime: false });
  assert.deepEqual(interpretCell("05/11/2026", unknown, true), text("05/11/2026"), "day and month could swap");
  assert.deepEqual(interpretCell("25/11/2026", unknown, true), { kind: "date", serial: dateSerial(2026, 11, 25), withTime: false });
  assert.deepEqual(interpretCell("31/02/2026", pt, true), text("31/02/2026"), "not a real date");
  assert.equal(interpretCell("2026-11-05 14:30", unknown, true).kind, "date");
  for (const value of ["=SUM(A1:A3)", "+1 call", "@user", "-", "N/A", "abc 12"]) assert.equal(interpretCell(value, en, true).kind, "text", value);
  assert.equal(parseNumber("12,34,56", "."), null);
  assert.equal(dateSerial(1900, 3, 1), 61);
});

test("writes workbooks with valid unique sheet names, frozen headers, filters and text that never becomes a formula", () => {
  assert.deepEqual(sheetNames(["Sales: Q1/Q2", "sales  q1 q2", "", "History", "x".repeat(40), "'Quoted'"]),
    ["Sales Q1 Q2", "sales q1 q2 (2)", "Table 3", "History (2)", "x".repeat(31), "Quoted"]);
  assert.equal(columnName(0), "A");
  assert.equal(columnName(27), "AB");
  assert.equal(columnName(701), "ZZ");
  assert.equal(xmlText("a<b>&\"\u0001"), "a&lt;b&gt;&amp;&quot;");

  const workbook = readZip(createXlsx([
    { name: "Prices", header: true, rows: [
      [text("Product"), text("Price"), text("Since")],
      [text("=HYPERLINK(\"http://evil\")"), { kind: "number", value: 9.9, format: { currency: "R$" } }, { kind: "date", serial: 46331, withTime: false }],
      [text("Widget"), { kind: "number", value: 0.25, format: "percent" }, text("")]
    ] },
    { name: "Notes", header: false, rows: [[text("plain")]] }
  ], { title: "Report", source: "https://example.com", created: new Date("2026-11-05T12:00:00Z") }));
  const xml = (name: string) => new TextDecoder().decode(workbook.find((entry) => entry.name === name)?.data);

  assert.deepEqual(workbook.map((entry) => entry.name).sort(), [
    "[Content_Types].xml", "_rels/.rels", "docProps/app.xml", "docProps/core.xml", "xl/_rels/workbook.xml.rels",
    "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"
  ]);
  const sheet = xml("xl/worksheets/sheet1.xml");
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:C3"\/>/);
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/evil&quot;\)<\/t><\/is><\/c>/);
  assert.doesNotMatch(sheet, /<f>/, "no cell is a formula");
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1">/, "headers are bold");
  assert.match(sheet, /<c r="B2" s="\d+"><v>9.9<\/v><\/c>/);
  assert.doesNotMatch(xml("xl/worksheets/sheet2.xml"), /pane|autoFilter/);
  assert.match(xml("xl/styles.xml"), /formatCode="&quot;R\$&quot; #,##0.00;-&quot;R\$&quot; #,##0.00"/);
  assert.match(xml("xl/styles.xml"), /formatCode="yyyy-mm-dd"/);
  assert.match(xml("xl/workbook.xml"), /<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Prices'!\$A\$1:\$C\$3<\/definedName>/);
  assert.match(xml("docProps/core.xml"), /<dc:title>Report<\/dc:title>/);
  assert.throws(() => createXlsx([]), /at least one sheet/);
});

const ARTICLE = `<!doctype html><html lang="en"><head><title>Guide</title></head><body>
<nav>Site menu</nav>
<main>
  <h1>Install the <code>cli</code></h1>
  <p>Read the <a href="/docs#setup">setup notes</a> and <strong>back up</strong> your <em>data</em>.<br>Then continue.</p>
  <aside>Sponsored</aside>
  <ul><li>First <a href="https://example.com/a">link</a></li><li>Second<ol start="3"><li>Nested</li></ol></li></ul>
  <table><thead><tr><th>Name</th><th>Value | unit</th></tr></thead><tbody><tr><td>Alpha</td><td>1</td></tr></tbody></table>
  <pre><code class="language-ts">const a = 1;
\`\`\`
</code></pre>
  <blockquote><p>Quoted text</p></blockquote>
  <img src="/logo.png" alt="Logo">
  <p hidden>Hidden</p>
  <div class="secret">Account 12345</div>
  <hr>
  <script>tracking()</script>
</main>
<footer>Footer</footer>
</body></html>`;

function guide(options: Partial<ExtractOptions> = {}): PageDocument {
  const { document } = parseHTML(ARTICLE);
  const root = findMainContent(document as unknown as Document);
  return buildDocument(root, { title: "Guide", url: "https://site.example/guide", language: "en", capturedAt: new Date("2026-11-05T12:00:00Z") }, {
    baseUrl: "https://site.example/guide",
    ...options,
    redacted: (element) => element.getAttribute("class") === "secret"
  });
}

test("extracts headings, inline marks, lists, tables, code, quotes, images and links from the main content", () => {
  const document = guide();
  const types = document.blocks.map((block) => block.type);
  assert.deepEqual(types, ["heading", "paragraph", "paragraph", "list", "table", "code", "quote", "paragraph", "paragraph", "rule"]);
  assert.equal(document.$schema.endsWith("web2doc-document-v1.schema.json"), true);
  assert.equal(document.schemaVersion, 1);
  const text = documentText(document.blocks);
  assert.match(text, /Install the cli/);
  assert.match(text, /Sponsored/, "an aside inside the main content stays unless page chrome is dropped");
  assert.doesNotMatch(text, /Site menu|Footer|Hidden|tracking|12345/);
  assert.match(text, /█████/);

  const markdown = renderMarkdown(document);
  assert.match(markdown, /^---\ntitle: "Guide"\nsource: "https:\/\/site.example\/guide"\ncaptured: "2026-11-05T12:00:00.000Z"\n---\n\n# Install the `cli`\n/);
  assert.match(markdown, /Read the \[setup notes\]\(https:\/\/site.example\/docs#setup\) and \*\*back up\*\* your _data_.\\\nThen continue./);
  assert.match(markdown, /- First \[link\]\(https:\/\/example.com\/a\)\n- Second\n\n  3. Nested/);
  assert.match(markdown, /\| Name \| Value \\\| unit \|\n\| --- \| --- \|\n\| Alpha \| 1 \|/);
  assert.match(markdown, /````ts\nconst a = 1;\n```\n````/, "the fence is longer than any fence inside the code");
  assert.match(markdown, /> Quoted text/);
  assert.match(markdown, /!\[Logo\]\(https:\/\/site.example\/logo.png\)/);

  const json = JSON.parse(renderJson(document)) as PageDocument;
  assert.deepEqual(json, JSON.parse(JSON.stringify(document)));

  const clean = guide({ dropPageChrome: true });
  assert.doesNotMatch(documentText(clean.blocks), /Sponsored/);
});

test("applies selection choices: skipped parts, highlights, comments and page breaks", () => {
  const { document } = parseHTML(`<article><h2>Title</h2><p id="a">Keep</p><p id="b">Drop</p><p id="c">Mark</p></article>`);
  const root = document.querySelector("article") as unknown as Element;
  const model = buildDocument(root, { title: "T", url: "https://x.example" }, {
    baseUrl: "https://x.example",
    skip: (element) => element.id === "b",
    highlighted: (element) => element.id === "c",
    comment: (element) => (element.id === "a" ? "Checked" : undefined),
    pageBreakBefore: (element) => element.id === "c"
  });
  assert.deepEqual(model.blocks, [
    { type: "heading", level: 2, content: [{ type: "text", text: "Title" }] },
    { type: "paragraph", content: [{ type: "text", text: "Keep" }] },
    { type: "note", text: "Checked" },
    { type: "pageBreak" },
    { type: "paragraph", content: [{ type: "text", text: "Mark", marks: ["highlight"] }] }
  ]);
  assert.match(renderMarkdown(model), /> \*\*Note:\*\* Checked\n\n<mark>Mark<\/mark>/);
});

test("writes an editable Word document with styles, numbering, tables, links, images and the source", () => {
  const document = guide();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const files = readZip(createDocx(document, new Map([["https://site.example/logo.png", { data: png, type: "png", width: 1200, height: 300 }]])));
  const xml = (name: string) => new TextDecoder().decode(files.find((entry) => entry.name === name)?.data);
  assert.deepEqual(files.map((entry) => entry.name).sort(), [
    "[Content_Types].xml", "_rels/.rels", "docProps/app.xml", "docProps/core.xml", "word/_rels/document.xml.rels",
    "word/document.xml", "word/media/image1.png", "word/numbering.xml", "word/styles.xml"
  ]);
  const body = xml("word/document.xml");
  assert.match(body, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Guide<\/w:t>/);
  assert.match(body, /Source: <\/w:t><\/w:r><w:hyperlink r:id="rId\d+"/);
  assert.match(body, /Captured: 2026-11-05 12:00 UTC/);
  assert.match(body, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(body, /<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="3"\/><\/w:numPr>/, "the nested ordered list gets its own numbering");
  assert.match(xml("word/numbering.xml"), /<w:num w:numId="3"><w:abstractNumId w:val="2"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"\/>/);
  assert.match(body, /<w:tbl>.*<w:tblHeader\/>.*Value \| unit/s);
  assert.match(body, /<w:pStyle w:val="Code"\/>.*const a = 1;<\/w:t><w:br\/>/s);
  assert.match(body, /<a:blip r:embed="rId\d+"\/>/);
  assert.match(body, /<wp:extent cx="5733288" cy="1433322"\/>/, "wide images are scaled to the page width");
  assert.match(body, /█████/);
  assert.doesNotMatch(body, /12345/);
  const rels = xml("word/_rels/document.xml.rels");
  assert.match(rels, /Target="https:\/\/site.example\/docs#setup" TargetMode="External"/);
  assert.match(rels, /Target="media\/image1.png"/);
  assert.match(xml("docProps/core.xml"), /<dc:description>Source: https:\/\/site.example\/guide<\/dc:description>/);

  // Without image data, images become links.
  const linked = new TextDecoder().decode(readZip(createDocx(document)).find((entry) => entry.name === "word/document.xml")?.data);
  assert.match(linked, /\[Image: Logo\]/);
});

test("the JSON export matches the published, versioned schema", async () => {
  const { readFileSync } = await import("node:fs");
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const addFormats = (await import("ajv-formats")).default;
  const schema = JSON.parse(readFileSync(new URL("../schemas/web2doc-document-v1.schema.json", import.meta.url), "utf8")) as { $id: string };
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const exported = JSON.parse(renderJson(guide())) as PageDocument;
  assert.equal(exported.$schema, schema.$id, "the export points at the schema");
  assert.equal(validate(exported), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...exported, schemaVersion: 2 }), false, "other versions are rejected");
});
