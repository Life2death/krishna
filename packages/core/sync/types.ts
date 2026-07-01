export const SYNC_TABLES = [
  'conversations', 'messages', 'memories', 'memory_embeddings',
  'learned_actions', 'skills', 'system_prompts', 'reminders',
  'voiceprint_samples',
] as const;

export type SyncTable = typeof SYNC_TABLES[number];

export const EXCLUDED_TABLES = ['audit_log', 'command_log', 'devices', 'interview_profiles'];

export interface SyncConfig {
  url: string;
  token: string;
  interval?: number;
}

export interface SyncRow {
  id: string;
  updated_at: number | string;
  [column: string]: unknown;
}

export interface TombstoneRow {
  table_name: string;
  row_id: string;
  deleted_at: number;
}

export interface SyncStateRow {
  table_name: string;
  last_pulled_at: number;
  last_pushed_at: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  tombstonesPulled: number;
  tombstonesPushed: number;
  errors: string[];
}
