export class CSVService {
  static exportTablesToCSV(): void {
    const tables = document.querySelectorAll("table");

    if (tables.length === 0) {
      return;
    }

    let csvContent = "";

    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cols = row.querySelectorAll("td, th");
        const rowData = Array.from(cols).map(col => `"${col.textContent?.trim() || ""}"`).join(",");
        csvContent += rowData + "\n";
      });
      csvContent += "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exported_tables.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  }
}
