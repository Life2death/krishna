export interface JobHistoryEntry {
  id: string;
  profileId: string;
  profileName: string;
  title: string;
  company: string;
  location: string;
  url: string;
  via?: string;
  matchScore?: number;
  postedAt?: string;
  viewedAt: number; // epoch ms — when search returned it
  clickedAt?: number; // epoch ms — when user clicked Apply
}
