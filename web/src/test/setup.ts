import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { matchMedia, setMobile } from "./media";

// findBy*/waitFor default to 1s. Debounced previews plus MUI renders can exceed that on a
// loaded CI runner with coverage on.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no layout engine. MUI X charts and the data grid measure their
// container through ResizeObserver; give them a fixed size so they render.
class FixedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const rect = { width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0, toJSON: () => ({}) };
    this.callback([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= FixedResizeObserver as unknown as typeof ResizeObserver;

// useMediaQuery reads window.matchMedia; see media.ts.
afterEach(() => setMobile(false));
window.matchMedia = matchMedia;
