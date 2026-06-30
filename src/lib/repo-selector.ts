import type { Memory, Skill, LearnedAction, SystemPrompt, SystemPromptInput, UpdateSystemPromptInput } from "@/types";
import type { Reminder } from "@/types/reminder";
import type { ChatConversation } from "@/types/completion";
import type { Message } from "@/types";

import {
  getAllMemories as localGetAllMemories,
  createMemory as localCreateMemory,
  deleteMemory as localDeleteMemory,
  deleteAllMemories as localDeleteAllMemories,
  getAllSkills as localGetAllSkills,
  getSkillByName as localGetSkillByName,
  updateSkillUseCount as localUpdateSkillUseCount,
  createSkill as localCreateSkill,
  deleteSkill as localDeleteSkill,
  deleteAllSkills as localDeleteAllSkills,
  getAllLearnedActions as localGetAllLearnedActions,
  getLearnedActionByInput as localGetLearnedActionByInput,
  createLearnedAction as localCreateLearnedAction,
  deleteLearnedAction as localDeleteLearnedAction,
  deleteAllLearnedActions as localDeleteAllLearnedActions,
  getAllReminders as localGetAllReminders,
  getDueReminders as localGetDueReminders,
  cancelReminder as localCancelReminder,
  createReminder as localCreateReminder,
  deleteReminder as localDeleteReminder,
  updateReminder as localUpdateReminder,
  getAllSystemPrompts as localGetAllSystemPrompts,
  createSystemPrompt as localCreateSystemPrompt,
  updateSystemPrompt as localUpdateSystemPrompt,
  deleteSystemPrompt as localDeleteSystemPrompt,
  getAllConversations as localGetAllConversations,
  getMostRecentConversation as localGetMostRecentConversation,
  appendMessages as localAppendMessages,
  saveConversation as localSaveConversation,
  deleteConversation as localDeleteConversation,
  deleteAllConversations as localDeleteAllConversations,
} from "@/lib/database";



export interface MemoriesRepo {
  getAllMemories(): Promise<Memory[]>;
  createMemory(memory: Memory): Promise<Memory>;
  deleteMemory(id: string): Promise<boolean>;
  deleteAllMemories(): Promise<boolean>;
}

export interface SkillsRepo {
  getAllSkills(): Promise<Skill[]>;
  getSkillByName(name: string): Promise<Skill | null>;
  updateSkillUseCount(id: number): Promise<void>;
  createSkill(skill: Skill): Promise<Skill>;
  deleteSkill(id: number): Promise<boolean>;
  deleteAllSkills(): Promise<boolean>;
}

export interface LearnedActionsRepo {
  getAllLearnedActions(): Promise<LearnedAction[]>;
  getLearnedActionByInput(input: string): Promise<LearnedAction | null>;
  createLearnedAction(action: LearnedAction): Promise<LearnedAction>;
  deleteLearnedAction(id: string): Promise<boolean>;
  deleteAllLearnedActions(): Promise<boolean>;
}

export interface RemindersRepo {
  getAllReminders(): Promise<Reminder[]>;
  getDueReminders(): Promise<Reminder[]>;
  createReminder(reminder: Reminder): Promise<Reminder>;
  updateReminder(reminder: Reminder): Promise<void>;
  cancelReminder(id: string): Promise<boolean>;
  deleteReminder(id: string): Promise<boolean>;
}

export interface SystemPromptsRepo {
  getAllSystemPrompts(): Promise<SystemPrompt[]>;
  createSystemPrompt(input: SystemPromptInput): Promise<SystemPrompt>;
  updateSystemPrompt(id: number, input: UpdateSystemPromptInput): Promise<SystemPrompt>;
  deleteSystemPrompt(id: number): Promise<void>;
}

export interface ChatHistoryRepo {
  getAllConversations(): Promise<ChatConversation[]>;
  getConversationById(id: string): Promise<ChatConversation | null>;
  getMostRecentConversation(): Promise<ChatConversation | null>;
  appendMessages(
    conversationId: string,
    messages: { role: "user" | "assistant"; content: string; timestamp: number }[],
  ): Promise<void>;
  saveConversation(conversation: ChatConversation): Promise<ChatConversation>;
  deleteConversation(id: string): Promise<boolean>;
  deleteAllConversations(): Promise<void>;
}

export interface ChatRepo {
  fetchAIResponse(params: {
    provider?: unknown;
    selectedProvider?: unknown;
    systemPrompt?: string;
    history?: Message[];
    userMessage: string;
    imagesBase64?: string[];
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

export interface Repo {
  memories: MemoriesRepo;
  skills: SkillsRepo;
  learnedActions: LearnedActionsRepo;
  reminders: RemindersRepo;
  systemPrompts: SystemPromptsRepo;
  chatHistory: ChatHistoryRepo;
  chat: ChatRepo;
}

const localRepo: Repo = {
  memories: {
    getAllMemories: localGetAllMemories,
    createMemory: localCreateMemory,
    deleteMemory: localDeleteMemory,
    deleteAllMemories: localDeleteAllMemories,
  },
  skills: {
    getAllSkills: localGetAllSkills,
    getSkillByName: localGetSkillByName,
    updateSkillUseCount: localUpdateSkillUseCount,
    createSkill: localCreateSkill,
    deleteSkill: localDeleteSkill,
    deleteAllSkills: localDeleteAllSkills,
  },
  learnedActions: {
    getAllLearnedActions: localGetAllLearnedActions,
    getLearnedActionByInput: localGetLearnedActionByInput,
    createLearnedAction: localCreateLearnedAction,
    deleteLearnedAction: localDeleteLearnedAction,
    deleteAllLearnedActions: localDeleteAllLearnedActions,
  },
  reminders: {
    getAllReminders: localGetAllReminders,
    getDueReminders: localGetDueReminders,
    createReminder: localCreateReminder,
    updateReminder: localUpdateReminder,
    cancelReminder: localCancelReminder,
    deleteReminder: localDeleteReminder,
  },
  systemPrompts: {
    getAllSystemPrompts: localGetAllSystemPrompts,
    createSystemPrompt: localCreateSystemPrompt,
    updateSystemPrompt: localUpdateSystemPrompt,
    deleteSystemPrompt: localDeleteSystemPrompt,
  },
  chatHistory: {
    getAllConversations: localGetAllConversations,
    getConversationById: async (id) => {
      const { getConversationById: fn } = await import("@/lib/database");
      return fn(id);
    },
    getMostRecentConversation: localGetMostRecentConversation,
    appendMessages: localAppendMessages,
    saveConversation: localSaveConversation,
    deleteConversation: localDeleteConversation,
    deleteAllConversations: localDeleteAllConversations,
  },
  chat: {
    async *fetchAIResponse(params: {
      provider?: any;
      selectedProvider?: any;
      systemPrompt?: string;
      history?: Message[];
      userMessage: string;
      imagesBase64?: string[];
      signal?: AbortSignal;
    }): AsyncIterable<string> {
      const { fetchAIResponse: fn } = await import("@/lib/functions");
      yield* fn(params as Parameters<typeof fn>[0]);
    },
  },
};

export function getRepo(): Repo {
  return localRepo;
}
