export type CSVTable = readonly (readonly string[])[];

export function formatTablesAsCSV(tables: readonly CSVTable[]): string {
  if (tables.length === 0) {
    return "";
  }

  const serializedTables = tables.map((rows) =>
    rows
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n")
  );

  return `\uFEFF${serializedTables.join("\r\n\r\n")}`;
}

function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
