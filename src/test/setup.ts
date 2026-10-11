import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { setLanguage } from "@/lib/i18n";
import { clearRepositoryViewCache } from "@/lib/repository-view-state";
afterEach(() => {
  cleanup();
  clearRepositoryViewCache();
  setLanguage("en");
  localStorage.clear();
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
HTMLElement.prototype.scrollIntoView = () => {};
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
