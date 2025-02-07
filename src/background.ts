console.log("[Background] Service Worker is running!");

// Runs when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("[Background] Extension installed successfully!");
});

// Listens for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Background] Received message:", message);

    if (message.action === "exportExcel") {
        console.log("[Background] Processing Excel export...");
    } else if (message.action === "exportPDF") {
        console.log("[Background] Processing PDF conversion...");
    }

    sendResponse({ success: true });
});
