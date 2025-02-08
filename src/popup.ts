console.log("[Popup] Script carregado!");

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Popup] DOM carregado!");

    const exportCSVButton = document.getElementById("exportCSV");
    const exportPDFButton = document.getElementById("exportPDF");

    if (!exportCSVButton || !exportPDFButton) {
        console.error("[Popup] Botões não encontrados! Verifique o popup.html");
        return;
    }

    exportCSVButton.addEventListener("click", () => {
        console.log("[Popup] Enviando mensagem para exportar CSV...");
        sendMessage("exportCSV");
    });

    exportPDFButton.addEventListener("click", () => {
        console.log("[Popup] Enviando mensagem para exportar PDF...");
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
