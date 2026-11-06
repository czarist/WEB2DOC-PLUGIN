import { diffLines, diffStats, visibleLines, type DiffLine } from "../shared/diff";
import { downloadBlob, fileName } from "../shared/files";
import type { Snapshot } from "../shared/settings";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Web2Doc comparison page is missing #${id}.`);
  return element as T;
}

function isSnapshot(value: unknown): value is Snapshot {
  return typeof value === "object" && value !== null && typeof (value as Snapshot).text === "string"
    && typeof (value as Snapshot).at === "string" && typeof (value as Snapshot).title === "string";
}

const PREFIX = { same: "  ", added: "+ ", removed: "- " } as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

let lines: DiffLine[] = [];

function render(): void {
  const list = byId<HTMLOListElement>("diff");
  const shown = visibleLines(lines, byId<HTMLInputElement>("onlyChanges").checked);
  list.replaceChildren(...shown.map((line) => {
    const item = document.createElement("li");
    if (line.kind === "gap") {
      item.className = "gap";
      item.textContent = `${line.count.toLocaleString()} unchanged ${line.count === 1 ? "line" : "lines"}`;
      return item;
    }
    item.className = line.kind;
    const marker = document.createElement("span");
    marker.className = "visually-hidden";
    marker.textContent = line.kind === "added" ? "Added: " : line.kind === "removed" ? "Removed: " : "";
    item.append(marker, line.text || " ");
    return item;
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  void (async () => {
    const { comparison } = await chrome.storage.session.get("comparison");
    const previous = (comparison as { previous?: unknown } | undefined)?.previous;
    const current = (comparison as { current?: unknown } | undefined)?.current;
    if (!isSnapshot(previous) || !isSnapshot(current)) {
      byId("compareEmpty").hidden = false;
      return;
    }
    lines = diffLines(previous.text.split("\n"), current.text.split("\n"));
    const stats = diffStats(lines);
    byId("beforeDate").textContent = dateFormat.format(new Date(previous.at));
    byId("afterDate").textContent = dateFormat.format(new Date(current.at));
    byId("beforeTitle").textContent = previous.title;
    byId("afterTitle").textContent = current.title;
    byId("compareSource").textContent = `Changes in the main content of ${current.url}.`;
    byId("compareStats").textContent = stats.added || stats.removed
      ? `${stats.added.toLocaleString()} ${stats.added === 1 ? "line" : "lines"} added, ${stats.removed.toLocaleString()} removed, ${stats.same.toLocaleString()} unchanged.`
      : "No changes in the main content.";
    render();

    byId("onlyChanges").addEventListener("change", render);
    byId("downloadDiff").addEventListener("click", () => {
      const text = `Before: ${previous.at} ${previous.title}\nAfter:  ${current.at} ${current.title}\nPage:   ${current.url}\n\n${lines.map((line) => PREFIX[line.kind] + line.text).join("\n")}\n`;
      downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), fileName("{title} - {label}", { title: current.title, url: current.url, label: "changes" }, "txt"));
    });
  })();
});
