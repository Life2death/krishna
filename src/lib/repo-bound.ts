/**
 * Repo-bound action functions for the orchestrator (krishna.context.tsx).
 *
 * These mirror the names/signatures of the core `@/lib/database` action fns and
 * `fetchAIResponse`, but each delegates to `getRepo()` so the live assistant flow
 * honours `brainMode`: in "local" mode they hit the Tauri SQLite driver, in
 * "remote" mode they go to the brain over HTTP. This is what makes memories,
 * skills, reminders, conversations and chat actually shared across devices —
 * previously the orchestrator called the local DB directly (split brain).
 *
 * NOTE: audit-log (createAuditEntry/getLastReversible) and learned-actions stay
 * local on purpose — the undo log is per-device, and app-resolution targets
 * legitimately differ per device (a Windows .exe vs an Android package).
 */
import type { Memory, Skill, Message } from "@/types";
import type { Reminder } from "@/types/reminder";
import type { ChatConversation } from "@/types/completion";
import { getRepo } from "./repo-selector";

// re-export the pure (non-DB) helper unchanged
export { generateConversationTitle } from "@/lib/database";

// --- memories ---
export const getAllMemories = (): Promise<Memory[]> => getRepo().memories.getAllMemories();
export const createMemory = (memory: Memory): Promise<Memory> => getRepo().memories.createMemory(memory);
export const deleteMemory = (id: string): Promise<boolean> => getRepo().memories.deleteMemory(id);

// --- skills ---
export const getAllSkills = (): Promise<Skill[]> => getRepo().skills.getAllSkills();
export const getSkillByName = (name: string): Promise<Skill | null> => getRepo().skills.getSkillByName(name);
export const createSkill = (skill: Skill): Promise<Skill> => getRepo().skills.createSkill(skill);
export const updateSkillUseCount = (id: number): Promise<void> => getRepo().skills.updateSkillUseCount(id);

// --- reminders ---
export const createReminder = (reminder: Reminder): Promise<Reminder> => getRepo().reminders.createReminder(reminder);
export const getDueReminders = (): Promise<Reminder[]> => getRepo().reminders.getDueReminders();
export const updateReminder = (reminder: Reminder): Promise<void> => getRepo().reminders.updateReminder(reminder);
export const cancelReminder = (id: string): Promise<boolean> => getRepo().reminders.cancelReminder(id);

// --- chat history --- (createConversation maps to saveConversation = upsert; safe for new ids)
export const createConversation = (conversation: ChatConversation): Promise<ChatConversation> =>
  getRepo().chatHistory.saveConversation(conversation);
export const appendMessages = (
  conversationId: string,
  messages: { role: "user" | "assistant"; content: string; timestamp: number }[],
): Promise<void> => getRepo().chatHistory.appendMessages(conversationId, messages);
export const getMostRecentConversation = (): Promise<ChatConversation | null> =>
  getRepo().chatHistory.getMostRecentConversation();
export const deleteConversation = (id: string): Promise<boolean> => getRepo().chatHistory.deleteConversation(id);

// --- chat completion --- (remote mode uses the brain's key; provider is ignored there)
export function fetchAIResponse(params: {
  provider?: unknown;
  selectedProvider?: unknown;
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  return getRepo().chat.fetchAIResponse(params);
}
