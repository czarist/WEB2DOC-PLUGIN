import type { TableHighlightMessage, TableSummary } from "./types/ExportResult";

export interface TablePickerElements {
  mainView: HTMLElement;
  pickerView: HTMLElement;
  summary: HTMLElement;
  list: HTMLElement;
  back: HTMLButtonElement;
  toggleAll: HTMLButtonElement;
  exportButton: HTMLButtonElement;
}

export interface TablePickerOptions {
  /** Sends the current selection and hovered table to the page highlighter. */
  highlight(message: TableHighlightMessage): void;
  onExport(indices: number[]): Promise<void>;
  onClose(): void;
}

export function getTablePickerElements(): TablePickerElements {
  const byId = (id: string): HTMLElement => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Web2Doc popup is missing #${id}.`);
    return element;
  };
  return {
    mainView: byId("mainView"),
    pickerView: byId("tablesView"),
    summary: byId("pickerSummary"),
    list: byId("tableList"),
    back: byId("pickerBack") as HTMLButtonElement,
    toggleAll: byId("toggleAllTables") as HTMLButtonElement,
    exportButton: byId("exportSelectedTables") as HTMLButtonElement
  };
}

export function exportButtonLabel(count: number): string {
  if (count === 0) return "Select tables";
  return count === 1 ? "Export 1 table" : `Export ${count} tables`;
}

export function describeTable(table: TableSummary): string {
  const rows = table.rows === 1 ? "1 row" : `${table.rows} rows`;
  const columns = table.columns === 1 ? "1 column" : `${table.columns} columns`;
  return `${rows} × ${columns}`;
}

/** The popup screen that lists the page's tables and exports the checked ones. */
export class TablePicker {
  private tables: TableSummary[] = [];
  private readonly selected = new Set<number>();
  private focused: number | null = null;
  private busy = false;

  constructor(private readonly elements: TablePickerElements, private readonly options: TablePickerOptions) {
    elements.back.addEventListener("click", () => this.close());
    elements.toggleAll.addEventListener("click", () => this.toggleAll());
    elements.exportButton.addEventListener("click", () => { void this.exportSelection(); });
    elements.list.addEventListener("mouseleave", () => this.setFocused(null));
  }

  open(tables: TableSummary[]): void {
    this.tables = tables;
    this.selected.clear();
    // A single table is the obvious choice; with several, the user picks.
    if (tables.length === 1 && tables[0]) this.selected.add(tables[0].index);
    this.focused = null;

    const { mainView, pickerView, summary, list } = this.elements;
    summary.textContent = `${tables.length === 1 ? "1 table" : `${tables.length} tables`} outlined on the page`;
    list.replaceChildren(...tables.map((table) => this.renderItem(table)));
    mainView.hidden = true;
    pickerView.hidden = false;
    this.update();
    // Focus the screen title rather than the first table so the page does not scroll yet.
    pickerView.querySelector<HTMLElement>("h2")?.focus();
  }

  close(): void {
    this.elements.pickerView.hidden = true;
    this.elements.mainView.hidden = false;
    this.options.onClose();
  }

  private renderItem(table: TableSummary): HTMLElement {
    const item = document.createElement("li");
    const label = document.createElement("label");
    label.className = "table-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.selected.has(table.index);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) this.selected.add(table.index);
      else this.selected.delete(table.index);
      this.update();
    });
    checkbox.addEventListener("focus", () => this.setFocused(table.index));

    const number = document.createElement("span");
    number.className = "table-number";
    number.textContent = String(table.index + 1);
    number.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "table-text";
    const title = document.createElement("span");
    title.className = "table-title";
    title.textContent = table.title;
    const meta = document.createElement("span");
    meta.className = "table-meta";
    meta.textContent = describeTable(table);
    text.append(title, meta);
    if (table.preview) {
      const preview = document.createElement("span");
      preview.className = "table-preview";
      preview.textContent = table.preview;
      preview.title = table.preview;
      text.append(preview);
    }

    label.append(checkbox, number, text);
    label.addEventListener("mouseenter", () => this.setFocused(table.index));
    item.append(label);
    return item;
  }

  private toggleAll(): void {
    const selectAll = this.selected.size < this.tables.length;
    this.selected.clear();
    if (selectAll) this.tables.forEach((table) => this.selected.add(table.index));
    this.elements.list.querySelectorAll("input").forEach((checkbox) => { checkbox.checked = selectAll; });
    this.update();
  }

  private setFocused(index: number | null): void {
    if (this.focused === index) return;
    this.focused = index;
    this.sendHighlight();
  }

  private update(): void {
    const { toggleAll, exportButton } = this.elements;
    toggleAll.textContent = this.selected.size < this.tables.length ? "Select all" : "Clear all";
    exportButton.textContent = exportButtonLabel(this.selected.size);
    exportButton.disabled = this.busy || this.selected.size === 0;
    this.sendHighlight();
  }

  private sendHighlight(): void {
    this.options.highlight({ selected: this.selection(), focused: this.focused });
  }

  private selection(): number[] {
    return [...this.selected].sort((a, b) => a - b);
  }

  private async exportSelection(): Promise<void> {
    if (this.selected.size === 0 || this.busy) return;
    this.busy = true;
    this.update();
    try {
      await this.options.onExport(this.selection());
    } finally {
      this.busy = false;
      this.update();
    }
  }
}
