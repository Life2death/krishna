export interface KrishnaSettings {
  enabled: boolean;
  wakeWord: string;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
}

export type Action =
  | { action: "open"; target: string }
  | { action: "remember"; key: string | null; value: string };

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
