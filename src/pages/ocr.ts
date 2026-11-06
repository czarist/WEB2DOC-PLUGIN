// Recognizes text in a captured image with tesseract.js. The engine, its worker and the
// language data ship with the extension, so recognition works offline and the image never
// leaves the device.

import { createWorker, type Worker } from "tesseract.js";
import { downloadBlob, fileName } from "../shared/files";

interface OcrImage {
  base64: string;
  title: string;
  url: string;
  at: string;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Web2Doc text recognition page is missing #${id}.`);
  return element as T;
}

function setStatus(state: "success" | "error" | "", text: string): void {
  const status = byId("ocrStatus");
  status.dataset["state"] = state;
  status.textContent = text;
}

function isOcrImage(value: unknown): value is OcrImage {
  return typeof value === "object" && value !== null && typeof (value as OcrImage).base64 === "string"
    && typeof (value as OcrImage).title === "string" && typeof (value as OcrImage).url === "string";
}

/** The language to start with: Portuguese for Portuguese browsers, English otherwise. */
function defaultLanguage(languages: readonly string[]): string {
  return languages.some((lang) => lang.toLowerCase().startsWith("pt")) ? "por" : "eng";
}

let image: OcrImage | undefined;
let worker: Worker | undefined;
let workerLanguage = "";

async function recognize(): Promise<void> {
  if (!image) return;
  const language = byId<HTMLSelectElement>("ocrLanguage").value;
  const progress = byId<HTMLProgressElement>("ocrProgress");
  const text = byId<HTMLTextAreaElement>("ocrText");
  const buttons = ["copyText", "downloadText", "recognizeAgain"].map((id) => byId<HTMLButtonElement>(id));
  buttons.forEach((button) => { button.disabled = true; });
  progress.value = 0;
  setStatus("", "Loading the text recognition engine…");
  try {
    if (!worker || workerLanguage !== language) {
      await worker?.terminate();
      worker = await createWorker(language.split("+"), 1, {
        workerPath: chrome.runtime.getURL("ocr/worker.min.js"),
        corePath: chrome.runtime.getURL("ocr/tesseract-core-simd-lstm.wasm.js"),
        langPath: chrome.runtime.getURL("ocr/lang"),
        gzip: true,
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (message: { status: string; progress: number }) => {
          if (message.status === "recognizing text") {
            progress.value = message.progress;
            setStatus("", "Recognizing text…");
          }
        }
      });
      workerLanguage = language;
    }
    const result = await worker.recognize(`data:image/png;base64,${image.base64}`);
    text.value = result.data.text.trim();
    progress.value = 1;
    const words = text.value.split(/\s+/).filter(Boolean).length;
    setStatus(words ? "success" : "error", words ? `Recognized ${words.toLocaleString()} ${words === 1 ? "word" : "words"}.` : "No text was found in this image.");
  } catch (error) {
    setStatus("error", `Text recognition failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    byId<HTMLButtonElement>("recognizeAgain").disabled = false;
    const hasText = text.value.length > 0;
    byId<HTMLButtonElement>("copyText").disabled = !hasText;
    byId<HTMLButtonElement>("downloadText").disabled = !hasText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void (async () => {
    const { ocrImage } = await chrome.storage.session.get("ocrImage");
    if (!isOcrImage(ocrImage)) {
      byId("ocrImage").hidden = true;
      byId("ocrEmpty").hidden = false;
      byId<HTMLButtonElement>("recognizeAgain").disabled = true;
      return;
    }
    image = ocrImage;
    // Free the session storage; the image stays in this page while it is open.
    await chrome.storage.session.remove("ocrImage");
    const img = byId<HTMLImageElement>("ocrImage");
    img.src = `data:image/png;base64,${image.base64}`;
    img.hidden = false;
    img.alt = `Captured from ${image.title || image.url}`;
    byId("ocrSource").textContent = `From ${image.title || image.url}. Text is recognized on this device; the image is not sent anywhere.`;
    document.title = `Text recognition – ${image.title || "Web2Doc"}`;
    byId<HTMLSelectElement>("ocrLanguage").value = defaultLanguage(navigator.languages);
    await recognize();
  })();

  byId("ocrLanguage").addEventListener("change", () => { void recognize(); });
  byId("recognizeAgain").addEventListener("click", () => { void recognize(); });
  byId("copyText").addEventListener("click", () => {
    void navigator.clipboard.writeText(byId<HTMLTextAreaElement>("ocrText").value)
      .then(() => setStatus("success", "Text copied to the clipboard."))
      .catch(() => setStatus("error", "The browser did not allow copying. Select the text and copy it instead."));
  });
  byId("downloadText").addEventListener("click", () => {
    const text = byId<HTMLTextAreaElement>("ocrText").value;
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), fileName("{title} - {label}", { title: image?.title ?? "text", label: "text" }, "txt"));
  });
});
