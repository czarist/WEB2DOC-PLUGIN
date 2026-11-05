
import type { ExportResult } from "./types/ExportResult";

type ExportAction = "exportCSV" | "exportPDF";

document.addEventListener("DOMContentLoaded", () => {
    const exportCSVButton = document.getElementById("exportCSV");
    const exportPDFButton = document.getElementById("exportPDF");
    const status = document.getElementById("exportStatus");

    if (!(exportCSVButton instanceof HTMLButtonElement)
        || !(exportPDFButton instanceof HTMLButtonElement)
        || !status) {
        throw new Error("Web2Doc popup is missing required controls.");
    }

    exportCSVButton.addEventListener("click", () => {
        sendMessage("exportCSV", status, [exportCSVButton, exportPDFButton]);
    });

    exportPDFButton.addEventListener("click", () => {
        sendMessage("exportPDF", status, [exportCSVButton, exportPDFButton]);
    });
});

function sendMessage(
    action: ExportAction,
    status: HTMLElement,
    buttons: HTMLButtonElement[]
): void {
    setBusy(true, buttons);
    status.textContent = "Contacting the active tab…";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || tabs[0]?.id === undefined) {
            finish(
                "Could not find an active webpage. Select a regular webpage and try again.",
                status,
                buttons
            );
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action }, (result: ExportResult | undefined) => {
            if (chrome.runtime.lastError) {
                finish(
                    "This page can't be accessed. Open a regular webpage and try again.",
                    status,
                    buttons
                );
                return;
            }

            if (!result || typeof result.message !== "string" || typeof result.success !== "boolean") {
                finish(
                    "The page returned an invalid response. Reload it and try again.",
                    status,
                    buttons
                );
                return;
            }

            finish(result.message, status, buttons);
        });
    });
}

function finish(message: string, status: HTMLElement, buttons: HTMLButtonElement[]): void {
    status.textContent = message;
    setBusy(false, buttons);
}

function setBusy(busy: boolean, buttons: HTMLButtonElement[]): void {
    buttons.forEach((button) => {
        button.disabled = busy;
    });
}
