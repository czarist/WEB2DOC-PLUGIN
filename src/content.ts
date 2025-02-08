import { ExportController } from "./controllers/ExportController";

console.log("[Content Script] Web2Doc ativo na página!");

chrome.runtime.onMessage.addListener((message) => {
  console.log("[Content Script] Mensagem recebida:", message);
  ExportController.handleExport(message.action);
});
