// The structure Web2Doc extracts from a page. Markdown, JSON and DOCX are all rendered from
// this model; the JSON export is this object as-is, described by
// schemas/web2doc-document-v1.schema.json.

export const DOCUMENT_SCHEMA_URL = "https://raw.githubusercontent.com/czarist/WEB2DOC-PLUGIN/main/schemas/web2doc-document-v1.schema.json";
export const DOCUMENT_SCHEMA_VERSION = 1;

export type Mark = "bold" | "italic" | "code" | "highlight" | "strike";

export type Inline =
  | { type: "text"; text: string; marks?: Mark[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "break" };

export interface TableCell {
  header: boolean;
  content: Inline[];
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; start?: number; items: Block[][] }
  | { type: "table"; rows: TableCell[][] }
  | { type: "code"; language?: string; text: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "note"; text: string }
  | { type: "rule" }
  | { type: "pageBreak" };

export interface PageDocument {
  $schema: string;
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  title: string;
  url: string;
  /** ISO 8601 timestamp of the capture. */
  capturedAt: string;
  language?: string;
  blocks: Block[];
}

/** Plain text of inline content, used for titles, table cells and comparisons. */
export function inlineText(content: readonly Inline[]): string {
  return content.map((inline) => {
    switch (inline.type) {
      case "text": return inline.text;
      case "link": return inlineText(inline.children);
      case "image": return inline.alt;
      case "break": return "\n";
    }
  }).join("");
}

/** Plain text of a whole document, one block per line group. */
export function documentText(blocks: readonly Block[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        lines.push(inlineText(block.content));
        break;
      case "list":
        block.items.forEach((item) => lines.push(documentText(item)));
        break;
      case "table":
        block.rows.forEach((row) => lines.push(row.map((cell) => inlineText(cell.content)).join("\t")));
        break;
      case "code":
        lines.push(block.text);
        break;
      case "quote":
        lines.push(documentText(block.blocks));
        break;
      case "note":
        lines.push(`Note: ${block.text}`);
        break;
      default:
        break;
    }
  }
  return lines.filter((line) => line.trim() !== "").join("\n");
}
