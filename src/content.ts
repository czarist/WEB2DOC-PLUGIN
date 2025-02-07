console.log("[Content Script] Active on:", window.location.href);

document.addEventListener("DOMContentLoaded", () => {
  console.log("[Content Script] DOM loaded, waiting for messages...");
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message) => {
  console.log("[Content Script] Received message:", message);

  if (message.action === "exportExcel") {
    console.log("[Content Script] Extracting tables for Excel export...");
    extractTablesToExcel();
  }

  if (message.action === "exportPDF") {
    console.log("[Content Script] Saving page as PDF...");
    savePageAsPDF();
  }
});

// Function to extract tables and export as Excel
function extractTablesToExcel() {
  const tables = document.querySelectorAll("table");
  if (tables.length === 0) {
    console.warn("[Content Script] No tables found.");
    return;
  }

  let csvContent = "";
  tables.forEach((table) => {
    table.querySelectorAll("tr").forEach((row) => {
      let rowData: string[] = [];
      row.querySelectorAll("td, th").forEach((cell) => {
        rowData.push(cell.textContent?.trim() || "");
      });
      csvContent += rowData.join(",") + "\n";
    });
  });

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "exported_table.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log("[Content Script] CSV downloaded.");
}

// Function to save the page as PDF
function savePageAsPDF() {
  window.print(); // Simple built-in PDF export
}
