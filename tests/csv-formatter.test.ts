import assert from "node:assert/strict";
import test from "node:test";
import { formatTablesAsCSV } from "../src/tables/CSVFormatter.ts";

test("returns an empty string when there are no tables", () => {
  assert.equal(formatTablesAsCSV([]), "");
});

test("escapes quotes and keeps commas and line breaks inside fields", () => {
  const csv = formatTablesAsCSV([
    [
      ['He said "go"', "São Paulo, SP"],
      ["first line\nsecond line", "ação"]
    ]
  ]);

  assert.equal(
    csv,
    '﻿"He said ""go""","São Paulo, SP"\r\n"first line\nsecond line","ação"'
  );
});

test("separates multiple tables with a blank CSV row", () => {
  const csv = formatTablesAsCSV([
    [["Table one"]],
    [["Table two"]]
  ]);

  assert.equal(csv, '﻿"Table one"\r\n\r\n"Table two"');
});
