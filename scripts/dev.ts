// Builds the extension in watch mode and opens a separate Chrome profile with it loaded.
// Usage: npm run dev [-- <start-url>]
// Set CHROME_PATH to use another Chromium-based browser.
//
// Branded Chrome ignores --load-extension since version 137, so the extension is loaded
// through the DevTools protocol (Extensions.loadUnpacked) over --remote-debugging-pipe.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import type { Configuration, Stats } from "webpack";

const require = createRequire(import.meta.url);
const webpack = require("webpack") as typeof import("webpack");
const config = require("../webpack.config.js") as Configuration;

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const profile = path.join(os.tmpdir(), "web2doc-dev-profile");
const startUrl = process.argv[2] ?? "https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population";

function findBrowser(): string {
  const fromEnv = process.env["CHROME_PATH"];
  if (fromEnv) return fromEnv;

  const candidates = process.platform === "win32"
    ? [
        path.join(process.env["PROGRAMFILES"] ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["LOCALAPPDATA"] ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome was not found. Set CHROME_PATH to the browser executable.");
  return found;
}

/** Minimal DevTools protocol client over Chrome's pipe (fd 3 = to Chrome, fd 4 = from Chrome). */
class PipeClient {
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(private readonly input: Writable, output: Readable) {
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      this.buffer += chunk;
      let end: number;
      while ((end = this.buffer.indexOf("\0")) >= 0) {
        const message = JSON.parse(this.buffer.slice(0, end)) as { id?: number; result?: unknown; error?: { message: string } };
        this.buffer = this.buffer.slice(end + 1);
        const request = message.id === undefined ? undefined : this.pending.get(message.id);
        if (!request || message.id === undefined) continue;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    });
  }

  send<T>(method: string, params: object): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.input.write(`${JSON.stringify({ id, method, params })}\0`);
    });
  }
}

function launchBrowser(executable: string): { browser: ChildProcess; client: PipeClient } {
  const browser = spawn(executable, [
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    startUrl
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });

  const input = browser.stdio[3] as Writable | null;
  const output = browser.stdio[4] as Readable | null;
  if (!input || !output) throw new Error("Could not open the DevTools pipe to the browser.");
  return { browser, client: new PipeClient(input, output) };
}

function describeErrors(stats: Stats): string {
  return stats.toString({ all: false, errors: true, colors: true });
}

const executable = findBrowser();
let session: ReturnType<typeof launchBrowser> | undefined;

const compiler = webpack(config);
const watcher = compiler.watch({ aggregateTimeout: 200 }, async (error, stats) => {
  if (error || !stats) {
    console.error(error ?? "Build failed.");
    return;
  }
  if (stats.hasErrors()) {
    console.error(describeErrors(stats));
    return;
  }

  try {
    if (!session) {
      session = launchBrowser(executable);
      session.browser.on("exit", () => {
        console.log("Browser closed; stopping.");
        stop();
      });
    }
    // Loading the same folder again reloads the extension with the new build.
    const { id } = await session.client.send<{ id: string }>("Extensions.loadUnpacked", { path: dist });
    console.log(`[${new Date().toLocaleTimeString()}] Extension loaded (${id}). Reload the tab to update the content script.`);
  } catch (loadError) {
    console.error("Could not load the extension:", loadError instanceof Error ? loadError.message : loadError);
  }
});

process.on("SIGINT", () => {
  session?.browser.kill();
  stop();
});

console.log(`Building and opening ${path.basename(executable)} with a separate profile (${profile})...`);

function stop(): void {
  if (watcher) watcher.close(() => process.exit(0));
  else process.exit(0);
}
