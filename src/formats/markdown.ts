// Renders a PageDocument as GitHub-flavored Markdown, with a YAML front matter block holding
// the title, the source URL and the capture date.

import type { Block, Inline, PageDocument, TableCell } from "../document/model";

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\]<>])/g, "\\$1");
}

/** Escapes characters that would start a block construct at the beginning of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+=-])/, "$1\\$2")
    .replace(/^(\s*\d+)([.)])(\s)/, "$1\\$2$3");
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const padded = /^`|`$/.test(text) || /^ .* $/.test(text) ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

function destination(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
}

function renderInlines(content: readonly Inline[], context: { inTable?: boolean } = {}): string {
  return content.map((inline) => {
    switch (inline.type) {
      case "break":
        return context.inTable ? "<br>" : "\\\n";
      case "image":
        return `![${escapeText(inline.alt)}](${destination(inline.src)})`;
      case "link": {
        const label = renderInlines(inline.children, context) || escapeText(inline.href);
        return `[${label}](${destination(inline.href)})`;
      }
      case "text": {
        const marks = inline.marks ?? [];
        if (marks.includes("code")) return codeSpan(inline.text);
        const leading = /^\s*/.exec(inline.text)?.[0] ?? "";
        const trailing = /\s*$/.exec(inline.text)?.[0] ?? "";
        const core = inline.text.trim();
        if (!core) return inline.text;
        let text = escapeText(core);
        if (context.inTable) text = text.replace(/\|/g, "\\|");
        if (marks.includes("bold")) text = `**${text}**`;
        if (marks.includes("italic")) text = `_${text}_`;
        if (marks.includes("strike")) text = `~~${text}~~`;
        if (marks.includes("highlight")) text = `<mark>${text}</mark>`;
        return `${leading}${text}${trailing}`;
      }
    }
  }).join("");
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text.split("\n").map((line) => (line ? pad + line : line)).join("\n");
}

function renderTable(rows: readonly TableCell[][]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const cell = (c: TableCell | undefined): string => (c ? renderInlines(c.content, { inTable: true }).replace(/\n/g, " ") : "");
  const line = (row: readonly TableCell[]): string =>
    `| ${Array.from({ length: width }, (_v, i) => cell(row[i]) || " ").join(" | ")} |`;
  const [first, ...rest] = rows;
  if (!first) return "";
  // GFM tables need a header row; the first row serves as one.
  return [line(first), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rest.map(line)].join("\n");
}

function fence(text: string): string {
  const longest = Math.max(0, ...(text.match(/^`{3,}/gm) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function renderBlocks(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(`${"#".repeat(block.level)} ${renderInlines(block.content).replace(/\n/g, " ")}`);
        break;
      case "paragraph":
        parts.push(renderInlines(block.content).split("\n").map(escapeLineStart).join("\n"));
        break;
      case "list": {
        const start = block.start ?? 1;
        parts.push(block.items.map((item, i) => {
          const marker = block.ordered ? `${start + i}.` : "-";
          const body = renderBlocks(item);
          return `${marker} ${indent(body, marker.length + 1).trimStart()}`;
        }).join("\n"));
        break;
      }
      case "table":
        parts.push(renderTable(block.rows));
        break;
      case "code": {
        const marker = fence(block.text);
        parts.push(`${marker}${block.language ?? ""}\n${block.text}\n${marker}`);
        break;
      }
      case "quote":
        parts.push(renderBlocks(block.blocks).split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
        break;
      case "note":
        parts.push(`> **Note:** ${escapeText(block.text)}`);
        break;
      case "rule":
        parts.push("---");
        break;
      case "pageBreak":
        break;
    }
  }
  return parts.filter((part) => part !== "").join("\n\n");
}

/** A YAML string: JSON strings are valid YAML scalars. */
function yaml(value: string): string {
  return JSON.stringify(value);
}

export function renderMarkdown(document: PageDocument): string {
  const front = [
    "---",
    `title: ${yaml(document.title)}`,
    `source: ${yaml(document.url)}`,
    `captured: ${yaml(document.capturedAt)}`,
    "---"
  ].join("\n");
  const body = renderBlocks(document.blocks);
  return `${front}\n\n${body}\n`;
}

export function renderJson(document: PageDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
