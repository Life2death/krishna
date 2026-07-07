import { describe, it, expect, vi, beforeEach } from "vitest";
import { setDriver } from "@krishna/core/database/driver";
import {
  createSavedSearch,
  getAllSavedSearches,
  getSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "@krishna/core/database/saved-searches.action";
import type { SavedSearch } from "@krishna/core/types/saved-search";

const mockSelect = vi.fn();
const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });

function makeSearch(overrides?: Partial<SavedSearch>): SavedSearch {
  return {
    id: "search-1",
    name: "PM Mumbai belt",
    roleTag: "program-manager",
    url: "https://naukri.com/pm-mumbai",
    chromeProfileDir: "Profile 1",
    chromeProfileName: "PM",
    mode: "manual",
    resumePathOverride: null,
    created_at: Date.now(),
    ...overrides,
  };
}

function dbRow(overrides?: Record<string, unknown>) {
  return {
    id: "search-1",
    name: "PM Mumbai belt",
    role_tag: "program-manager",
    url: "https://naukri.com/pm-mumbai",
    chrome_profile_dir: "Profile 1",
    chrome_profile_name: "PM",
    mode: "manual",
    resume_path_override: null,
    created_at: Date.now(),
    ...overrides,
  };
}

describe("createSavedSearch", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockExecute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    setDriver({ select: mockSelect, execute: mockExecute } as any);
  });

  it("creates a valid saved search", async () => {
    mockSelect.mockResolvedValue([]);

    const search = makeSearch();
    const result = await createSavedSearch(search);

    expect(result).toEqual({ ok: true, search });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO saved_searches"),
      expect.arrayContaining(["search-1", "PM Mumbai belt"]),
    );
  });

  it("rejects empty name", async () => {
    const result = await createSavedSearch(makeSearch({ name: "  " }));

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects non-naukri/linkedin URL", async () => {
    const result = await createSavedSearch(makeSearch({ url: "https://google.com" }));

    expect(result).toEqual({ ok: false, error: "URL must be on naukri.com or linkedin.com" });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects duplicate name", async () => {
    mockSelect.mockResolvedValue([{ id: "existing" }]);

    const result = await createSavedSearch(makeSearch());

    expect(result).toEqual({ ok: false, error: 'A saved search named "PM Mumbai belt" already exists' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects invalid URL format", async () => {
    const result = await createSavedSearch(makeSearch({ url: "not-a-url" }));

    expect(result).toEqual({ ok: false, error: "URL is not valid" });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("allows linkedin.com URLs", async () => {
    mockSelect.mockResolvedValue([]);

    const search = makeSearch({ url: "https://linkedin.com/jobs" });
    const result = await createSavedSearch(search);

    expect(result).toEqual({ ok: true, search });
  });
});

describe("getAllSavedSearches", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    setDriver({ select: mockSelect, execute: mockExecute } as any);
  });

  it("returns all searches ordered by created_at DESC", async () => {
    mockSelect.mockResolvedValue([dbRow({ id: "s2" }), dbRow({ id: "s1" })]);

    const result = await getAllSavedSearches();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s2");
    expect(mockSelect).toHaveBeenCalledWith(
      "SELECT * FROM saved_searches ORDER BY created_at DESC",
    );
  });

  it("returns empty array when none exist", async () => {
    mockSelect.mockResolvedValue([]);

    const result = await getAllSavedSearches();

    expect(result).toEqual([]);
  });
});

describe("getSavedSearch", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    setDriver({ select: mockSelect, execute: mockExecute } as any);
  });

  it("returns search by id", async () => {
    mockSelect.mockResolvedValue([dbRow()]);

    const result = await getSavedSearch("search-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("search-1");
    expect(result!.name).toBe("PM Mumbai belt");
  });

  it("returns null when not found", async () => {
    mockSelect.mockResolvedValue([]);

    const result = await getSavedSearch("nonexistent");

    expect(result).toBeNull();
  });
});

describe("updateSavedSearch", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockExecute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    setDriver({ select: mockSelect, execute: mockExecute } as any);
  });

  it("updates name", async () => {
    const result = await updateSavedSearch("search-1", { name: "New Name" });

    expect(result).toEqual({ ok: true });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE saved_searches SET"),
      expect.arrayContaining(["New Name", "search-1"]),
    );
  });

  it("rejects empty name", async () => {
    const result = await updateSavedSearch("search-1", { name: "  " });

    expect(result).toEqual({ ok: false, error: "Name cannot be empty" });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects invalid URL on update", async () => {
    const result = await updateSavedSearch("search-1", { url: "https://evil.com" });

    expect(result).toEqual({ ok: false, error: "URL must be on naukri.com or linkedin.com" });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("deleteSavedSearch", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockExecute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    setDriver({ select: mockSelect, execute: mockExecute } as any);
  });

  it("deletes search by id", async () => {
    const result = await deleteSavedSearch("search-1");

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM saved_searches WHERE id = ?",
      ["search-1"],
    );
  });

  it("returns false when not found", async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 0 });

    const result = await deleteSavedSearch("nonexistent");

    expect(result).toBe(false);
  });
});
