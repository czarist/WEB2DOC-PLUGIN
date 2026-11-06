import { renderMarkdown } from "../formats/markdown";
import { getPreferences, DEFAULT_PREFERENCES } from "../shared/settings";
import { SelectionController } from "../selection/SelectionController";
import { SelectionPanel } from "../selection/SelectionPanel";
import { TABLE_HIGHLIGHT_PORT, isTableHighlightMessage } from "../shared/messages";
import { TableHighlighter } from "../tables/TableHighlighter";
import { ContentRouter } from "./ContentRouter";
import { buildDocumentFile, deliver, isHidden, selectionDocument } from "./PageExporter";

// Preferences are read once per page and refreshed when they change.
let fileNamePattern = DEFAULT_PREFERENCES.fileNamePattern;
void getPreferences().then((preferences) => { fileNamePattern = preferences.fileNamePattern; }).catch(() => undefined);
chrome.storage?.onChanged?.addListener(() => {
  void getPreferences().then((preferences) => { fileNamePattern = preferences.fileNamePattern; }).catch(() => undefined);
});

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// The "save part of the page" tools. Captures are made by the background service worker
// once the page has been prepared; documents are built here.
const panel = new SelectionPanel();
const selection = new SelectionController({
  view: panel,
  document,
  send: (request) => chrome.runtime.sendMessage(request),
  saveDocument: async ({ format, selection: chosen, title, fileName }) =>
    deliver(await buildDocumentFile(selectionDocument(chosen, title), format, fileName)),
  markdown: (chosen, title) => renderMarkdown(selectionDocument(chosen, title)),
  copyText,
  canVisit: (element) => !isHidden(element) && element.getClientRects().length > 0,
  fileNamePattern: () => fileNamePattern
});
panel.connect(selection);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  ContentRouter.handle(message, { startSelection: (mode) => selection.start(mode) })
    .catch((error: unknown) => {
      const details = error instanceof Error ? error.message : "Unknown error";
      console.error("Web2Doc export failed:", details);
      return { success: false, message: `Export failed: ${details}` };
    })
    .then(sendResponse);
  return true;
});

// While the popup's table picker is open it keeps this port connected; closing the
// popup disconnects it and removes the highlights.
const highlighter = new TableHighlighter();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TABLE_HIGHLIGHT_PORT) return;
  port.onMessage.addListener((message: unknown) => {
    if (isTableHighlightMessage(message)) {
      highlighter.show(ContentRouter.tables, message.selected, message.focused);
    }
  });
  port.onDisconnect.addListener(() => highlighter.clear());
});
