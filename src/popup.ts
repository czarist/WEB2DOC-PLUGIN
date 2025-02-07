console.log("[Popup] Script loaded!");

document.addEventListener("DOMContentLoaded", () => {
    const exportExcelButton = document.getElementById("exportExcel");
    const exportPDFButton = document.getElementById("exportPDF");

    exportExcelButton?.addEventListener("click", () => {
        console.log("[Popup] Export Excel button clicked!");
        chrome.runtime.sendMessage({ action: "exportExcel" }, (response) => {
            console.log("[Popup] Response from background:", response);
        });
    });

    exportPDFButton?.addEventListener("click", () => {
        console.log("[Popup] Export PDF button clicked!");
        chrome.runtime.sendMessage({ action: "exportPDF" }, (response) => {
            console.log("[Popup] Response from background:", response);
        });
    });
});
