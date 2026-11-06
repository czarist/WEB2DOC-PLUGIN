// A layer drawn above the page in a closed shadow root, so page styles cannot change it.
// The layer itself never takes pointer events; elements inside it may opt back in.
// Used by the table highlights and the selection panel.

export class PageOverlay {
  private host: HTMLElement | undefined;
  private shadow: ShadowRoot | undefined;
  private frame = 0;
  private readonly scheduleLayout = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.onLayout();
    });
  };

  /**
   * @param tagName custom element name for the host, unique per overlay.
   * @param style CSS for the shadow root.
   * @param onLayout called on scroll and resize to reposition boxes.
   */
  constructor(private readonly tagName: string, private readonly style: string, private readonly onLayout: () => void) {}

  get mounted(): boolean {
    return this.host !== undefined;
  }

  /** The shadow root, created on first use. */
  get root(): ShadowRoot {
    if (this.shadow) return this.shadow;
    const host = document.createElement(this.tagName);
    host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = this.style;
    shadow.append(style);
    document.documentElement.append(host);
    window.addEventListener("resize", this.scheduleLayout);
    window.addEventListener("scroll", this.scheduleLayout, { capture: true, passive: true });
    this.host = host;
    this.shadow = shadow;
    return shadow;
  }

  /** The host element, used to tell overlay events apart from page events. */
  get element(): HTMLElement | undefined {
    return this.host;
  }

  /** Hides the whole layer, for example while the page is captured. */
  setHidden(hidden: boolean): void {
    if (this.host) this.host.style.display = hidden ? "none" : "";
  }

  remove(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener("resize", this.scheduleLayout);
    window.removeEventListener("scroll", this.scheduleLayout, true);
    this.host?.remove();
    this.host = undefined;
    this.shadow = undefined;
  }
}

/** Positions `box` over `element` in page coordinates; hides it when the element is not rendered. */
export function placeBox(box: HTMLElement, element: Element | null | undefined): DOMRect | undefined {
  const rect = element?.isConnected ? element.getBoundingClientRect() : undefined;
  if (!rect || rect.width === 0 || rect.height === 0) {
    box.style.display = "none";
    return undefined;
  }
  box.style.display = "block";
  box.style.left = `${rect.left + window.scrollX}px`;
  box.style.top = `${rect.top + window.scrollY}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  return rect;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
