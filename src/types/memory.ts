export interface Memory {
  id: string;
  key: string | null;
  value: string;
  source: string;
  confirmed: number;
  createdAt: number;
  lastUsedAt: number | null;
}