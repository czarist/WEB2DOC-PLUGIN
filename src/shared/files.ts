// File names, byte encodings and downloads shared by every context.

const MIME_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown;charset=utf-8",
  json: "application/json;charset=utf-8",
  mhtml: "multipart/related",
  zip: "application/zip",
  txt: "text/plain;charset=utf-8",
  svg: "image/svg+xml"
} as const;

export type FileKind = keyof typeof MIME_TYPES;

const EXTENSIONS: Record<FileKind, string> = {
  pdf: "pdf", png: "png", csv: "csv", xlsx: "xlsx", docx: "docx", markdown: "md",
  json: "json", mhtml: "mhtml", zip: "zip", txt: "txt", svg: "svg"
};

export function mimeType(kind: FileKind): string {
  return MIME_TYPES[kind];
}

/** Values available to file name patterns such as `{title} - {date}`. */
export interface FileNameContext {
  title: string;
  url?: string;
  date?: Date;
  /** Extra label such as "tables" or "images". */
  label?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function host(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** Removes characters that are not allowed in file names and trims the result. */
export function cleanFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
}

/**
 * Builds a safe file name from a pattern. Supported fields: {title}, {date}, {time}, {host}
 * and {label}. The extension is added once, even if the pattern or title already has it.
 */
export function fileName(pattern: string, context: FileNameContext, kind: FileKind): string {
  const date = context.date ?? new Date();
  const extension = EXTENSIONS[kind];
  const values: Record<string, string> = {
    title: context.title,
    date: isoDate(date),
    time: `${pad(date.getHours())}-${pad(date.getMinutes())}`,
    host: host(context.url),
    label: context.label ?? ""
  };
  // A label such as "tables" is always part of the name, so exports of the same page stay apart.
  let template = pattern.trim() || "{title}";
  if (context.label && !template.includes("{label}")) template += " - {label}";
  const filled = template.replace(/\{(title|date|time|host|label)\}/g, (_match, key: string) => values[key] ?? "");
  const withoutExtension = filled.replace(new RegExp(`\\.${extension}\\s*$`, "i"), "");
  const cleaned = cleanFileName(withoutExtension.replace(/(\s*-\s*)+$/, "").replace(/^(\s*-\s*)+/, ""));
  return `${cleaned || "page"}.${extension}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Starts a download from a page or extension page through a temporary link. The object URL
 * is released shortly after the click, or immediately if the download could not start.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  let started = false;
  try {
    if (!document.body) throw new Error("The page is not ready to start a download.");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    started = true;
  } finally {
    link.remove();
    if (started) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    else URL.revokeObjectURL(url);
  }
}
