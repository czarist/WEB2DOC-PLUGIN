// Draws numbered outlines over the page's tables while the popup's table picker is open.
// The overlay lives in a closed shadow root so page styles cannot change it, and it never
// receives pointer events.

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
  private host: HTMLElement | undefined;
  private root: ShadowRoot | undefined;
  private boxes: HTMLElement[] = [];
  private tables: HTMLTableElement[] = [];
  private lastFocused: number | null = null;
  private frame = 0;
  private readonly scheduleLayout = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.layout();
    });
  };

  show(tables: HTMLTableElement[], selected: number[], focused: number | null): void {
    if (!this.host) this.mount();
    if (tables !== this.tables) this.build(tables);

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
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener("resize", this.scheduleLayout);
    window.removeEventListener("scroll", this.scheduleLayout, true);
    this.host?.remove();
    this.host = undefined;
    this.root = undefined;
    this.boxes = [];
    this.tables = [];
    this.lastFocused = null;
  }

  private mount(): void {
    const host = document.createElement("web2doc-table-highlight");
    host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    this.root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.root.append(style);
    document.documentElement.append(host);
    this.host = host;
    window.addEventListener("resize", this.scheduleLayout);
    window.addEventListener("scroll", this.scheduleLayout, { capture: true, passive: true });
  }

  private build(tables: HTMLTableElement[]): void {
    this.boxes.forEach((box) => box.remove());
    this.tables = tables;
    this.boxes = tables.map((_table, index) => {
      const box = document.createElement("div");
      box.className = "box";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(index + 1);
      box.append(badge);
      this.root?.append(box);
      return box;
    });
  }

  private layout(): void {
    this.boxes.forEach((box, index) => {
      const table = this.tables[index];
      const rect = table?.isConnected ? table.getBoundingClientRect() : undefined;
      if (!rect || rect.width === 0 || rect.height === 0) {
        box.style.display = "none";
        return;
      }
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      box.style.display = "block";
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      // Keep the badge inside the page when the table touches the top or left edge.
      const badge = box.firstElementChild as HTMLElement | null;
      if (badge) {
        badge.style.left = left < 14 ? "2px" : "";
        badge.style.top = top < 14 ? "2px" : "";
      }
    });
  }
}

function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.top < window.innerHeight - 40;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
