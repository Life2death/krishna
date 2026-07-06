export interface KrishnaSettings {
  enabled: boolean;
  wakeWord: string;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
}

export type Action =
  | { action: "open"; target: string }
  | { action: "remember"; key: string | null; value: string }
  | { action: "travel_time"; from?: string; to?: string; mode?: string }
  | { action: "travel_best"; from?: string; to?: string; mode?: string; window_hours?: number }
  | { action: "gmail_search"; query: string; maxResults?: number }
  | { action: "gmail_read"; id: string }
  | { action: "gmail_list_labels" }
  | { action: "gmail_send"; to: string; subject: string; body: string; cc?: string; bcc?: string }
  | { action: "gmail_recruiters"; window_days?: number }
  | { action: "job_queue" }
  | { action: "route_watch"; from?: string; to?: string; mode?: string; threshold_minutes?: number; interval_minutes?: number; window_hours?: number }
  | { action: "route_watch_cancel" }
  | { action: "job_apply" }
  | { action: "job_apply_submit"; url: string; jobId: string; title: string; company: string }
  | { action: "speech_ban"; phrase: string }
  | { action: "speech_teach"; phrase: string; category?: string }
  | { action: "speech_refresh" }
  | { action: "speech_accept_vocabulary" };

export interface StepAction {
  tool: string;
  args: Record<string, string>;
  out?: string;
}

export interface ParsedReply {
  spokenText: string;
  actions: Action[];
  plan?: {
    say: string;
    needsConfirmation: boolean;
    steps: StepAction[];
  };
}

export interface AssistantTurnResult {
  transcription: string;
  reply: string;
  actions: Action[];
}

export type AssistantStatus = "idle" | "listening" | "thinking" | "speaking" | "confirming";
