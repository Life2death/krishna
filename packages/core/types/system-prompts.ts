export interface SystemPrompt {
  id: number;
  name: string;
  prompt: string;
  created_at: number;
  updated_at: number;
}

export interface SystemPromptInput {
  name: string;
  prompt: string;
}

export interface UpdateSystemPromptInput {
  name?: string;
  prompt?: string;
}
