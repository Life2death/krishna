import "@testing-library/jest-dom";
import { vi } from "vitest";
import { setDriver } from "@krishna/core/database/driver";
import { setHttpFetch } from "@krishna/core/http";
import { setSettingsGetter } from "@krishna/core/settings";

// Mock Tauri APIs that aren't available in the test environment
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() =>
      Promise.resolve({
        execute: vi.fn(),
        select: vi.fn(() => Promise.resolve([])),
      })
    ),
  },
}));

// Set up injectable platform services for tests
setDriver({
  select: vi.fn() as any,
  execute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
});

setHttpFetch(vi.fn() as any);

setSettingsGetter(() => ({
  responseLength: "auto",
  language: "english",
  autoScroll: true,
}));

// Mock FileReader for blobToBase64 tests
class MockFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsDataURL(_blob: Blob) {
    setTimeout(() => {
      this.result = `data:audio/wav;base64,SGVsbG9Xb3JsZA==`;
      this.onloadend?.();
    }, 0);
  }
}

Object.defineProperty(global, "FileReader", {
  writable: true,
  value: MockFileReader,
});
