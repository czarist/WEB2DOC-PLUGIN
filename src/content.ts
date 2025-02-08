import { ExportController } from "./controllers/ExportController";


chrome.runtime.onMessage.addListener((message) => {
  ExportController.handleExport(message.action);
});
