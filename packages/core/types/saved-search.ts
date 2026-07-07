export type SavedSearchMode = "manual" | "assisted";

export interface SavedSearch {
  id: string;
  name: string;
  roleTag: string;
  url: string;
  chromeProfileDir: string;
  chromeProfileName: string;
  mode: SavedSearchMode;
  resumePathOverride: string | null;
  created_at: number;
}
