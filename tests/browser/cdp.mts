// Minimal DevTools-protocol driver for Chromium with an unpacked extension.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

/** The browser to test: CHROME_PATH, or the newest Chromium installed by Playwright. */
function findChromium(): string {
  if (process.env["CHROME_PATH"]) return process.env["CHROME_PATH"];
  const base = process.platform === "win32" ? path.join(os.homedir(), "AppData/Local/ms-playwright")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library/Caches/ms-playwright") : path.join(os.homedir(), ".cache/ms-playwright");
  const builds = existsSync(base) ? readdirSync(base).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse() : [];
  for (const build of builds) {
    for (const candidate of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-linux64/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"]) {
      const file = path.join(base, build, candidate);
      if (existsSync(file)) return file;
    }
  }
  throw new Error("Chromium was not found. Install it with `npx playwright install chromium` or set CHROME_PATH.");
}

export const chromePath = findChromium();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  private nextId = 0;
  private buffer = "";
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  readonly listeners = new Set<(m: any) => void>();
  readonly process: ChildProcess;
  worker = "";
  extensionId = "";

  constructor(readonly profile: string, readonly downloads: string) {
    rmSync(downloads, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(downloads, { recursive: true });
    mkdirSync(path.join(profile, "Default"), { recursive: true });
    writeFileSync(path.join(profile, "Default/Preferences"), JSON.stringify({
      download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
      profile: { content_settings: { exceptions: { automatic_downloads: {} } } }
    }));
    this.process = spawn(chromePath, [
      "--headless=new", "--no-sandbox", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "--lang=en-US", "about:blank"
    ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    const output = this.process.stdio[4] as Readable;
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      this.buffer += chunk;
      let end;
      while ((end = this.buffer.indexOf("\0")) >= 0) {
        const m = JSON.parse(this.buffer.slice(0, end));
        this.buffer = this.buffer.slice(end + 1);
        const p = m.id ? this.pending.get(m.id) : undefined;
        if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
        else this.listeners.forEach((l) => l(m));
      }
    });
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      (this.process.stdio[3] as Writable).write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + "\0");
    });
  }

  async attach(targetId: string): Promise<string> {
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    return sessionId;
  }

  async loadExtension(dir: string): Promise<void> {
    const { id } = await this.send("Extensions.loadUnpacked", { path: dir });
    this.extensionId = id;
    for (let i = 0; i < 80 && !this.worker; i++) {
      const { targetInfos } = await this.send("Target.getTargets");
      const sw = targetInfos.find((t: any) => t.type === "service_worker" && t.url.includes(id));
      if (sw) this.worker = await this.attach(sw.targetId);
      else await sleep(100);
    }
    if (!this.worker) throw new Error("service worker not found");
  }

  async evaluate(session: string, expression: string): Promise<any> {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  async openPage(url: string, dark = false): Promise<{ targetId: string; session: string; tabId: number }> {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const session = await this.attach(targetId);
    await this.send("Page.enable", {}, session);
    await this.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }, session);
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] }, session);
    if (url !== "about:blank") await this.navigate(session, url);
    await this.send("Target.activateTarget", { targetId });
    const tabId = this.worker ? await this.evaluate(this.worker, "chrome.tabs.query({}).then((tabs) => Math.max(...tabs.map((t) => t.id)))") : -1;
    return { targetId, session, tabId };
  }

  async navigate(session: string, url: string): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      const l = (m: any) => { if (m.method === "Page.loadEventFired" && m.sessionId === session) { this.listeners.delete(l); resolve(); } };
      this.listeners.add(l);
    });
    await this.send("Page.navigate", { url }, session);
    await loaded;
  }

  async findTarget(predicate: (url: string) => boolean, timeoutMs = 10000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { targetInfos } = await this.send("Target.getTargets");
      const target = targetInfos.find((t: any) => t.type === "page" && predicate(t.url));
      if (target) return target;
      await sleep(150);
    }
    return undefined;
  }

  /** Opens the real popup for the active tab and returns its session. */
  async openPopup(): Promise<string | undefined> {
    for (const t of (await this.send("Target.getTargets")).targetInfos) if (t.url.endsWith("/popup.html")) await this.send("Target.closeTarget", { targetId: t.targetId }).catch(() => undefined);
    await sleep(250);
    const opened = await this.evaluate(this.worker, "chrome.action.openPopup().then(() => 'ok', (e) => e.message)");
    if (opened !== "ok") return undefined;
    const popup = await this.findTarget((url) => url.endsWith("/popup.html"), 5000);
    if (!popup) return undefined;
    const session = await this.attach(popup.targetId);
    await this.send("Page.enable", {}, session);
    await sleep(400);
    return session;
  }

  async shot(session: string, file: string): Promise<void> {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" }, session);
    writeFileSync(file, Buffer.from(data, "base64"));
  }

  async mouse(session: string, x: number, y: number, click = true): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, session);
    if (!click) return;
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, session);
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, session);
  }

  async drag(session: string, from: [number, number], to: [number, number]): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from[0], y: from[1] }, session);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from[0], y: from[1], button: "left", buttons: 1, clickCount: 1 }, session);
    for (let i = 1; i <= 5; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / 5;
      const y = from[1] + ((to[1] - from[1]) * i) / 5;
      await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 }, session);
    }
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to[0], y: to[1], button: "left", buttons: 0, clickCount: 1 }, session);
  }

  async key(session: string, key: string, code: number, modifiers = 0): Promise<void> {
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: code, modifiers }, session);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code, modifiers }, session);
    await sleep(150);
  }

  /** Center of an element in the page, scrolled into view. */
  async center(session: string, selector: string, edge = false): Promise<{ x: number; y: number }> {
    return this.evaluate(session, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block: "center"}); const r = e.getBoundingClientRect(); return ${edge ? "{ x: r.left + 6, y: r.top + 6 }" : "{ x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30) }"}; })()`);
  }

  async clickSelector(session: string, selector: string, options: { edge?: boolean; click?: boolean } = {}): Promise<void> {
    const { x, y } = await this.center(session, selector, options.edge);
    await sleep(120);
    await this.mouse(session, x, y, options.click ?? true);
    await sleep(160);
  }

  /** Finds a node inside the closed shadow root of an extension overlay. */
  async overlayNode(session: string, selector: string, host = "web2doc-selection"): Promise<number | undefined> {
    const { root } = await this.send("DOM.getDocument", { depth: -1, pierce: true }, session);
    const find = (node: any): any => {
      if (node.localName === host) return node;
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) { const f = find(child); if (f) return f; }
      return undefined;
    };
    const found = find(root);
    if (!found?.shadowRoots?.[0]) return undefined;
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: found.shadowRoots[0].nodeId, selector }, session);
    return nodeId || undefined;
  }

  async overlayText(session: string, selector: string): Promise<string> {
    const nodeId = await this.overlayNode(session, selector);
    if (!nodeId) return "";
    const { outerHTML } = await this.send("DOM.getOuterHTML", { nodeId }, session);
    return String(outerHTML).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
  }

  async clickOverlay(session: string, selector: string): Promise<void> {
    const nodeId = await this.overlayNode(session, selector);
    if (!nodeId) throw new Error(`panel control ${selector} not found`);
    const { model } = await this.send("DOM.getBoxModel", { nodeId }, session);
    const [x1, y1, , , x3, y3] = model.content;
    await this.mouse(session, (x1 + x3) / 2, (y1 + y3) / 2);
    await sleep(220);
  }

  async typeOverlay(session: string, selector: string, text: string): Promise<void> {
    await this.clickOverlay(session, selector);
    await this.key(session, "a", 65, 2);
    await this.send("Input.insertText", { text }, session);
    await sleep(120);
  }

  /** Waits for a new download with the extension and returns its path. */
  async download(before: Set<string>, extension: string, timeoutMs = 45000): Promise<string | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const done = readdirSync(this.downloads).filter((f) => f.toLowerCase().endsWith(extension) && !before.has(f));
      if (done.length) {
        const file = path.join(this.downloads, done[0]!);
        // Wait until the size stops changing.
        let size = -1;
        for (let i = 0; i < 20 && size !== statSync(file).size; i++) { size = statSync(file).size; await sleep(250); }
        return file;
      }
      await sleep(200);
    }
    return undefined;
  }

  snapshotDownloads(): Set<string> {
    return new Set(readdirSync(this.downloads));
  }

  close(): void {
    this.process.kill();
  }
}
