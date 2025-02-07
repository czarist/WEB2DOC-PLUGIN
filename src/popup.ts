console.log("[Popup] Script loaded!");

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Popup] DOM fully loaded!");

    const exportExcelButton = document.getElementById("exportExcel");
    const exportPDFButton = document.getElementById("exportPDF");

    if (!exportExcelButton || !exportPDFButton) {
        console.error("[Popup] Buttons not found! Check popup.html");
        return;
    }

    exportExcelButton.addEventListener("click", () => {
        console.log("[Popup] Sending message to content script for Excel export...");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "exportExcel" });
            }
        });
    });

    exportPDFButton.addEventListener("click", () => {
        console.log("[Popup] Sending message to content script for PDF export...");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "exportPDF" });
            }
        });
    });
});
