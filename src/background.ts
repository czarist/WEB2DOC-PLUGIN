chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Background] Received message:", message);
  
    if (message.action === "exportExcel") {
      console.log("[Background] Processing Excel export...");
      // Future: Add Excel export logic here
    }
  
    if (message.action === "exportPDF") {
      console.log("[Background] Processing PDF conversion...");
      // Future: Add PDF export logic here
    }
  
    sendResponse({ success: true });
  });
  