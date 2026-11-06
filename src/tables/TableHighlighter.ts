// Draws numbered outlines over the page's tables while the popup's table picker is open.
// The overlay never receives pointer events.

import { PageOverlay, placeBox, prefersReducedMotion } from "../shared/PageOverlay";

const STYLE = `
:host { all: initial; }
.box {
  position: absolute;
  box-sizing: border-box;
  border-radius: 4px;
  outline: 2px dashed rgba(31, 91, 216, 0.6);
  outline-offset: 2px;
  transition: background-color 120ms ease-out, outline-color 120ms ease-out;
}
.box.selected { outline: 2px solid #1f5bd8; background: rgba(31, 91, 216, 0.07); }
.box.focused { outline: 3px solid #1f5bd8; background: rgba(31, 91, 216, 0.16); }
.badge {
  position: absolute;
  top: -12px;
  left: -12px;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 2px solid #1f5bd8;
  border-radius: 12px;
  background: #ffffff;
  color: #1f5bd8;
  font: 600 12px/20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
}
.selected .badge, .focused .badge { background: #1f5bd8; color: #ffffff; }
@media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;

export class TableHighlighter {
  private readonly overlay = new PageOverlay("web2doc-table-highlight", STYLE, () => this.layout());
  private boxes: HTMLElement[] = [];
  private tables: HTMLTableElement[] = [];
  private lastFocused: number | null = null;

  show(tables: HTMLTableElement[], selected: number[], focused: number | null): void {
    if (tables !== this.tables || !this.overlay.mounted) this.build(tables);

    const chosen = new Set(selected);
    this.boxes.forEach((box, index) => {
      box.classList.toggle("selected", chosen.has(index));
      box.classList.toggle("focused", index === focused);
    });
    this.layout();

    if (focused !== null && focused !== this.lastFocused) {
      const table = this.tables[focused];
      if (table && !isInViewport(table)) {
        // Show the start of the table (and its badge) rather than the middle of a long one.
        const top = table.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    }
    this.lastFocused = focused;
  }

  clear(): void {
    this.overlay.remove();
    this.boxes = [];
    this.tables = [];
    this.lastFocused = null;
  }

  private build(tables: HTMLTableElement[]): void {
    this.boxes.forEach((box) => box.remove());
    this.tables = tables;
    const root = this.overlay.root;
    this.boxes = tables.map((_table, index) => {
      const box = document.createElement("div");
      box.className = "box";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(index + 1);
      box.append(badge);
      root.append(box);
      return box;
    });
  }

  private layout(): void {
    this.boxes.forEach((box, index) => {
      const rect = placeBox(box, this.tables[index]);
      // Keep the badge inside the page when the table touches the top or left edge.
      const badge = box.firstElementChild as HTMLElement | null;
      if (rect && badge) {
        badge.style.left = rect.left + window.scrollX < 14 ? "2px" : "";
        badge.style.top = rect.top + window.scrollY < 14 ? "2px" : "";
      }
    });
  }
}

function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.top < window.innerHeight - 40;
}
