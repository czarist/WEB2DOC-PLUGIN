// Decides how a table cell's text is written to a spreadsheet. Text stays text unless the
// user asked for conversion and the value can be read without guessing: the page language
// decides the decimal separator and the day/month order, and ambiguous values stay text.

export type NumberFormat = "general" | "percent" | { currency: string };

export type CellValue =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number; format: NumberFormat }
  | { kind: "date"; serial: number; withTime: boolean };

export interface ValueContext {
  /** The page language, such as `pt-BR` or `en-US`; empty when the page does not declare one. */
  lang: string;
}

type DateOrder = "dmy" | "mdy" | "ymd";

const COMMA_DECIMAL = new Set(["pt", "de", "es", "fr", "it", "nl", "ru", "pl", "tr", "sv", "da", "nb", "no", "nn", "fi",
  "cs", "sk", "id", "vi", "ro", "hu", "el", "uk", "bg", "hr", "sl", "sr", "lt", "lv", "et", "ca", "gl", "eu", "is"]);
const DOT_DECIMAL = new Set(["en", "ja", "zh", "ko", "he", "th", "hi", "ms", "fil", "tl", "ga", "cy", "mt"]);
const DOT_DECIMAL_REGIONS = new Set(["CH", "LI", "MX", "GT", "DO", "PR", "PE", "PA", "SV", "HN", "NI"]);
const MDY_REGIONS = new Set(["US", "PH", "FM", "MH", "PW"]);
const YMD_LANGUAGES = new Set(["ja", "zh", "ko", "hu", "lt"]);

function parseLang(lang: string): { language: string; region: string } {
  const [language = "", region = ""] = lang.trim().replace(/_/g, "-").split("-");
  return { language: language.toLowerCase(), region: region.toUpperCase() };
}

/** The decimal separator used by the page's language, or null when it is unknown. */
export function decimalSeparator(lang: string): "." | "," | null {
  const { language, region } = parseLang(lang);
  if (!language) return null;
  if (COMMA_DECIMAL.has(language)) return DOT_DECIMAL_REGIONS.has(region) && language === "es" ? "." : region === "CH" ? "." : ",";
  if (DOT_DECIMAL.has(language)) return language === "en" && region === "ZA" ? "," : ".";
  return null;
}

/** The order of day, month and year in short dates, or null when it is unknown. */
export function dateOrder(lang: string): DateOrder | null {
  const { language, region } = parseLang(lang);
  if (!language) return null;
  if (YMD_LANGUAGES.has(language)) return "ymd";
  if (language === "en") {
    if (!region) return null;
    return MDY_REGIONS.has(region) ? "mdy" : "dmy";
  }
  return COMMA_DECIMAL.has(language) || DOT_DECIMAL.has(language) ? "dmy" : null;
}

const CURRENCIES: Array<[RegExp, string]> = [
  [/^R\$/, "R$"], [/^US\$/, "US$"], [/^\$/, "$"], [/^€/, "€"], [/^£/, "£"], [/^¥/, "¥"],
  [/^(BRL|USD|EUR|GBP|JPY)\b/i, ""]
];
const CURRENCY_SUFFIX = /\s*(€|R\$|\$|£|¥|BRL|USD|EUR|GBP|JPY)$/i;

const MAX_SIGNIFICANT_DIGITS = 15;

/** Reads a number written with the page's separators. Returns null when it is ambiguous. */
export function parseNumber(text: string, decimal: "." | "," | null): number | null {
  let value = text.replace(/[    ]/g, " ").trim();
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  if (/^[-−+]/.test(value)) {
    negative = /^[-−]/.test(value);
    value = value.slice(1).trim();
  }
  if (!/^[\d.,' ]+$/.test(value) || !/\d/.test(value)) return null;
  // Spaces and apostrophes only group thousands.
  if (/[ ']/.test(value)) {
    if (!/^\d{1,3}([ ']\d{3})+([.,]\d+)?$/.test(value)) return null;
    value = value.replace(/[ ']/g, "");
  }

  const dots = (value.match(/\./g) ?? []).length;
  const commas = (value.match(/,/g) ?? []).length;
  let decimalMark: "." | "," | null = null;
  if (dots && commas) {
    decimalMark = value.lastIndexOf(".") > value.lastIndexOf(",") ? "." : ",";
  } else if (dots + commas === 1) {
    const mark = dots ? "." : ",";
    const fraction = value.split(mark)[1] ?? "";
    if (fraction.length !== 3) decimalMark = mark;
    else if (decimal === null) return null; // "1,234" or "1.234" depends on the language
    else decimalMark = decimal === mark ? mark : null;
  } else if (dots + commas > 1) {
    decimalMark = null; // only grouping separators, such as 1,234,567
  }
  if (decimal !== null && decimalMark !== null && decimalMark !== decimal && dots + commas === 1) return null;

  const group = decimalMark === "." ? "," : decimalMark === "," ? "." : dots ? "." : ",";
  const [integer = "", fraction] = decimalMark ? value.split(decimalMark) : [value];
  if (integer.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(integer)) return null;
  if (fraction !== undefined && !/^\d+$/.test(fraction)) return null;
  const digits = integer.replace(/\D/g, "") + (fraction ?? "");
  if (digits.replace(/^0+/, "").length > MAX_SIGNIFICANT_DIGITS) return null;

  const number = Number(`${integer.replace(/\D/g, "")}${fraction !== undefined ? `.${fraction}` : ""}`);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

const DAY_MS = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Converts a calendar date to a spreadsheet serial number (days since 1899-12-30). */
export function dateSerial(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): number | null {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 9999) return null;
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (time - EXCEL_EPOCH) / DAY_MS + (hours * 3600 + minutes * 60 + seconds) / 86400;
}

function parseDate(text: string, order: DateOrder | null): CellValue | null {
  const time = /(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const iso = text.match(new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${time.source}`));
  if (iso) {
    const [, y, m, d, hh, mm, ss] = iso;
    const serial = dateSerial(Number(y), Number(m), Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
    return serial === null ? null : { kind: "date", serial, withTime: hh !== undefined };
  }
  const short = text.match(new RegExp(`^(\\d{1,2})([-/.])(\\d{1,2})\\2(\\d{4})${time.source}`));
  if (!short) return null;
  const [, a, , b, y, hh, mm, ss] = short;
  const first = Number(a);
  const second = Number(b);
  let resolved: DateOrder | null = order === "ymd" ? null : order;
  if (!resolved) {
    if (first > 12 && second <= 12) resolved = "dmy";
    else if (second > 12 && first <= 12) resolved = "mdy";
    else return null; // both could be a month
  }
  const [day, month] = resolved === "dmy" ? [first, second] : [second, first];
  const serial = dateSerial(Number(y), month, day, Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
  return serial === null ? null : { kind: "date", serial, withTime: hh !== undefined };
}

/** Interprets one cell. Without `convert`, or when the value is ambiguous, the text is kept. */
export function interpretCell(text: string, context: ValueContext, convert: boolean): CellValue {
  const keep: CellValue = { kind: "text", text };
  const value = text.trim();
  if (!convert || value === "" || value.length > 64) return keep;
  const date = parseDate(value, dateOrder(context.lang));
  if (date) return date;
  // Identifiers such as 007, 0123 or ZIP codes keep their leading zeros.
  if (/^[-+]?0\d/.test(value)) return keep;
  const decimal = decimalSeparator(context.lang);

  if (/%$/.test(value)) {
    const number = parseNumber(value.slice(0, -1), decimal);
    return number === null ? keep : { kind: "number", value: number / 100, format: "percent" };
  }

  let rest = value;
  let currency: string | null = null;
  let sign = "";
  if (/^[-−]/.test(rest)) {
    sign = "-";
    rest = rest.slice(1).trim();
  }
  for (const [pattern, symbol] of CURRENCIES) {
    const match = rest.match(pattern);
    if (match) {
      currency = symbol || match[0].toUpperCase();
      rest = rest.slice(match[0].length).trim();
      break;
    }
  }
  if (currency === null) {
    const suffix = rest.match(CURRENCY_SUFFIX);
    if (suffix?.[1]) {
      currency = /^[a-z]/i.test(suffix[1]) ? suffix[1].toUpperCase() : suffix[1];
      rest = rest.slice(0, suffix.index).trim();
    }
  }
  if (currency !== null && /^0\d/.test(rest)) return keep;

  const number = parseNumber(sign + rest, decimal);
  if (number === null) return keep;
  return { kind: "number", value: number, format: currency === null ? "general" : { currency } };
}
