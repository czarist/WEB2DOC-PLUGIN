// ZIP archives for every context: the browser (XLSX, DOCX, batch exports) and Node (release
// packaging). Entries are stored uncompressed unless a deflate function is supplied, which
// keeps the writer synchronous and free of platform APIs.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export interface ZipWriteOptions {
  /** Raw DEFLATE compressor, for example `zlib.deflateRawSync` in Node. */
  deflate?: (data: Uint8Array) => Uint8Array;
  /** Entry timestamp; a fixed date keeps archives reproducible. */
  date?: Date;
}

export interface ZipReadOptions {
  /** Raw DEFLATE decompressor, required to read compressed entries. */
  inflate?: (data: Uint8Array) => Uint8Array;
}

const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const STORE = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

function dosDateTime(date: Date | undefined): { time: number; day: number } {
  if (!date || date.getFullYear() < 1980) return { time: 0, day: (1 << 5) | 1 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/** Builds a ZIP archive. Entry names must be unique; use forward slashes for folders. */
export function createZip(entries: readonly ZipEntry[], options: ZipWriteOptions = {}): Uint8Array {
  const { time, day } = dosDateTime(options.date);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const deflated = options.deflate?.(entry.data);
    const useDeflate = deflated !== undefined && deflated.length < entry.data.length;
    const body = useDeflate ? deflated : entry.data;
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, useDeflate ? DEFLATE : STORE, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, useDeflate ? DEFLATE : STORE, true);
    header.setUint16(12, time, true);
    header.setUint16(14, day, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, body.length, true);
    header.setUint32(24, entry.data.length, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);

    parts.push(new Uint8Array(local.buffer), name, body);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + body.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return concatBytes([...parts, ...central, new Uint8Array(end.buffer)]);
}

/** Reads a ZIP archive and checks every entry's CRC. */
export function readZip(archive: Uint8Array, options: ZipReadOptions = {}): ZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let endOffset = -1;
  for (let i = archive.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory record not found.");

  const count = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error(`Invalid central directory entry at offset ${cursor}.`);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = archive.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === STORE) data = raw.slice();
    else if (method === DEFLATE && options.inflate) data = options.inflate(raw);
    else throw new Error(`${name}: unsupported compression method ${method}.`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch.`);

    entries.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
