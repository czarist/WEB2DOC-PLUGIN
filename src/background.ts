chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Mensagem recebida:", message);
  sendResponse({ success: true });
});
