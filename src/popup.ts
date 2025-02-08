
document.addEventListener("DOMContentLoaded", () => {

    const exportCSVButton = document.getElementById("exportCSV");
    const exportPDFButton = document.getElementById("exportPDF");

    if (!exportCSVButton || !exportPDFButton) {
        return;
    }

    exportCSVButton.addEventListener("click", () => {
        sendMessage("exportCSV");
    });

    exportPDFButton.addEventListener("click", () => {
        sendMessage("exportPDF");
    });
});

function sendMessage(action: string): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action });
        }
    });
}
