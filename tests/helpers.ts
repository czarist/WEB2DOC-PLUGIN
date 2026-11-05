import type { TestContext } from "node:test";

// Install partial browser doubles without claiming they implement the full DOM.
export function stubGlobal(t: TestContext, key: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else Reflect.deleteProperty(globalThis, key);
  });
}
