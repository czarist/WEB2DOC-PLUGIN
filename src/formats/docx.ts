// Writes an editable Word document (.docx) from a PageDocument: headings and lists use Word
// styles and numbering, tables are real tables, links are hyperlinks, and images are embedded
// when their bytes are available. The source URL and capture date open the document.

import { inlineText, type Block, type Inline, type Mark, type PageDocument, type TableCell } from "../document/model";
import { xmlText } from "./xlsx";
import { createZip, utf8, type ZipEntry } from "./zip";

export interface DocxImage {
  data: Uint8Array;
  type: "png" | "jpeg" | "gif";
  /** Natural size in CSS pixels. */
  width: number;
  height: number;
}

const EMU_PER_PX = 9525;
const MAX_IMAGE_WIDTH_EMU = Math.round(6.27 * 914400); // A4 width minus 1 inch margins
const EXTENSIONS: Record<DocxImage["type"], string> = { png: "png", jpeg: "jpeg", gif: "gif" };

class DocxBuilder {
  private relationships: string[] = [];
  private nextRel = 3; // rId1: styles, rId2: numbering
  private nextDrawing = 1;
  private readonly media: ZipEntry[] = [];
  private readonly imageRels = new Map<string, string>();
  private readonly linkRels = new Map<string, string>();
  private readonly nums: string[] = [];
  private nextNum = 3; // 1: bullets, 2: numbers starting at 1

  constructor(private readonly images: ReadonlyMap<string, DocxImage>) {}

  private rel(type: string, target: string, external = false): string {
    const id = `rId${this.nextRel++}`;
    this.relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${xmlText(target)}"${external ? ' TargetMode="External"' : ""}/>`);
    return id;
  }

  private linkRel(href: string): string {
    let id = this.linkRels.get(href);
    if (!id) {
      id = this.rel("hyperlink", href, true);
      this.linkRels.set(href, id);
    }
    return id;
  }

  private run(text: string, marks: readonly Mark[] = [], extra = ""): string {
    const props = [
      extra,
      marks.includes("bold") ? "<w:b/>" : "",
      marks.includes("italic") ? "<w:i/>" : "",
      marks.includes("strike") ? "<w:strike/>" : "",
      marks.includes("code") ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : "",
      marks.includes("highlight") ? '<w:highlight w:val="yellow"/>' : ""
    ].join("");
    const pieces = text.split("\n").map((part) => `<w:t xml:space="preserve">${xmlText(part)}</w:t>`).join("<w:br/>");
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${pieces}</w:r>`;
  }

  private image(src: string, alt: string): string {
    const image = this.images.get(src);
    if (!image) {
      const label = alt ? `[Image: ${alt}]` : "[Image]";
      return this.hyperlink(src, [{ type: "text", text: label }]);
    }
    let id = this.imageRels.get(src);
    if (!id) {
      const name = `image${this.media.length + 1}.${EXTENSIONS[image.type]}`;
      this.media.push({ name: `word/media/${name}`, data: image.data });
      id = this.rel("image", `media/${name}`);
      this.imageRels.set(src, id);
    }
    let cx = Math.max(1, Math.round(image.width * EMU_PER_PX));
    let cy = Math.max(1, Math.round(image.height * EMU_PER_PX));
    if (cx > MAX_IMAGE_WIDTH_EMU) {
      cy = Math.round(cy * (MAX_IMAGE_WIDTH_EMU / cx));
      cx = MAX_IMAGE_WIDTH_EMU;
    }
    const n = this.nextDrawing++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${xmlText(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}" descr="${xmlText(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  private hyperlink(href: string, children: readonly Inline[], marks: readonly Mark[] = []): string {
    const runs = this.runs(children, marks, '<w:rStyle w:val="Hyperlink"/>') || this.run(href, marks, '<w:rStyle w:val="Hyperlink"/>');
    if (!/^(https?|mailto|ftp):/i.test(href)) return runs;
    return `<w:hyperlink r:id="${this.linkRel(href)}" w:history="1">${runs}</w:hyperlink>`;
  }

  runs(content: readonly Inline[], marks: readonly Mark[] = [], extra = ""): string {
    return content.map((inline) => {
      switch (inline.type) {
        case "text": return inline.text ? this.run(inline.text, [...marks, ...(inline.marks ?? [])], extra) : "";
        case "break": return "<w:r><w:br/></w:r>";
        case "image": return this.image(inline.src, inline.alt);
        case "link": return extra ? this.runs(inline.children, marks, extra) : this.hyperlink(inline.href, inline.children, marks);
      }
    }).join("");
  }

  private paragraph(content: string, props = ""): string {
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
  }

  private listNum(ordered: boolean, start: number): number {
    if (!ordered) return 1;
    const id = this.nextNum++;
    this.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`);
    return id;
  }

  private table(rows: readonly TableCell[][]): string {
    const width = Math.max(1, ...rows.map((row) => row.length));
    const grid = Array.from({ length: width }, () => `<w:gridCol w:w="${Math.floor(9000 / width)}"/>`).join("");
    const body = rows.map((row) => {
      const header = row.length > 0 && row.every((cell) => cell.header);
      const cells = Array.from({ length: width }, (_v, i) => {
        const cell = row[i];
        const runs = cell ? this.runs(cell.content, cell.header ? ["bold"] : []) : "";
        return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${this.paragraph(runs, '<w:spacing w:after="0"/>')}</w:tc>`;
      }).join("");
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>${this.paragraph("", '<w:spacing w:after="0"/>')}`;
  }

  blocks(blocks: readonly Block[], context: { style?: string; depth?: number } = {}): string {
    const style = context.style ? `<w:pStyle w:val="${context.style}"/>` : "";
    return blocks.map((block) => {
      switch (block.type) {
        case "heading":
          return this.paragraph(this.runs(block.content), `<w:pStyle w:val="Heading${block.level}"/>`);
        case "paragraph":
          return this.paragraph(this.runs(block.content), style);
        case "code":
          return this.paragraph(this.run(block.text, ["code"]).replace('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>', ""), '<w:pStyle w:val="Code"/>');
        case "quote":
          return this.blocks(block.blocks, { style: "Quote", depth: context.depth ?? 0 });
        case "note":
          return this.paragraph(this.run("Note: ", ["bold"]) + this.run(block.text), '<w:pStyle w:val="Note"/>');
        case "rule":
          return this.paragraph("", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr>');
        case "pageBreak":
          return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        case "table":
          return this.table(block.rows);
        case "list":
          return this.list(block, context.depth ?? 0);
      }
    }).join("");
  }

  private list(block: Extract<Block, { type: "list" }>, depth: number): string {
    const level = Math.min(depth, 8);
    const numId = this.listNum(block.ordered, block.start ?? 1);
    return block.items.map((item) => {
      let numbered = false;
      return item.map((child) => {
        if (child.type === "list") return this.list(child, depth + 1);
        if ((child.type === "paragraph" || child.type === "heading") && !numbered) {
          numbered = true;
          return this.paragraph(this.runs(child.content), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);
        }
        if (child.type === "paragraph") {
          return this.paragraph(this.runs(child.content), `<w:pStyle w:val="ListParagraph"/><w:ind w:left="${720 * (level + 1)}"/>`);
        }
        return this.blocks([child], { depth: depth + 1 });
      }).join("");
    }).join("");
  }

  documentRels(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${this.relationships.join("")}</Relationships>`;
  }

  numbering(): string {
    const levels = (format: "bullet" | "decimal"): string => Array.from({ length: 9 }, (_v, l) => {
      const text = format === "bullet" ? ["•", "◦", "▪"][l % 3] : `%${l + 1}.`;
      const font = format === "bullet" ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>' : "";
      return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${format === "bullet" ? "bullet" : l % 3 === 1 ? "lowerLetter" : l % 3 === 2 ? "lowerRoman" : "decimal"}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr>${font}</w:lvl>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels("bullet")}</w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${levels("decimal")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>${this.nums.join("")}</w:numbering>`;
  }

  get mediaEntries(): ZipEntry[] {
    return this.media;
  }
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="5B6270"/><w:sz w:val="18"/></w:rPr></w:style>
${[1, 2, 3, 4, 5, 6].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${level <= 2 ? 300 : 200}" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 30, 26, 24, 22, 22][level - 1]}"/></w:rPr></w:style>`).join("\n")}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="A0A0A0"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF8C5"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F5BD8"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

function captureLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function createDocx(document: PageDocument, images: ReadonlyMap<string, DocxImage> = new Map()): Uint8Array {
  const builder = new DocxBuilder(images);
  const intro = [
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${builder.runs([{ type: "text", text: document.title || "Untitled page" }])}</w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>${builder.runs([{ type: "text", text: "Source: " }, { type: "link", href: document.url, children: [{ type: "text", text: document.url }] }])}</w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/><w:spacing w:after="240"/></w:pPr>${builder.runs([{ type: "text", text: `Captured: ${captureLabel(document.capturedAt)}` }])}</w:p>`
  ].join("");
  // Skip a first heading that repeats the title.
  const first = document.blocks[0];
  const blocks = first?.type === "heading" && inlineText(first.content).trim() === document.title.trim() ? document.blocks.slice(1) : document.blocks;
  const body = builder.blocks(blocks);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${intro}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const created = new Date(document.capturedAt);
  const files: ZipEntry[] = [
    { name: "[Content_Types].xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`) },
    { name: "_rels/.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
    { name: "docProps/core.xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(document.title)}</dc:title><dc:description>${xmlText(`Source: ${document.url}`)}</dc:description><dc:creator>Web2Doc</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${Number.isNaN(created.getTime()) ? "" : created.toISOString().replace(/\.\d{3}Z$/, "Z")}</dcterms:created></cp:coreProperties>`) },
    { name: "docProps/app.xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Web2Doc</Application></Properties>`) },
    { name: "word/document.xml", data: utf8(documentXml) },
    { name: "word/styles.xml", data: utf8(STYLES) },
    { name: "word/numbering.xml", data: utf8(builder.numbering()) },
    { name: "word/_rels/document.xml.rels", data: utf8(builder.documentRels()) },
    ...builder.mediaEntries
  ];
  return createZip(files, Number.isNaN(created.getTime()) ? {} : { date: created });
}
