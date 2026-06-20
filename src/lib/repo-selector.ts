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
  createSkill as localCreateSkill,
  deleteSkill as localDeleteSkill,
  deleteAllSkills as localDeleteAllSkills,
  getAllLearnedActions as localGetAllLearnedActions,
  getLearnedActionByInput as localGetLearnedActionByInput,
  createLearnedAction as localCreateLearnedAction,
  deleteLearnedAction as localDeleteLearnedAction,
  deleteAllLearnedActions as localDeleteAllLearnedActions,
  getAllReminders as localGetAllReminders,
  createReminder as localCreateReminder,
  deleteReminder as localDeleteReminder,
  updateReminder as localUpdateReminder,
  getAllSystemPrompts as localGetAllSystemPrompts,
  createSystemPrompt as localCreateSystemPrompt,
  updateSystemPrompt as localUpdateSystemPrompt,
  deleteSystemPrompt as localDeleteSystemPrompt,
  getAllConversations as localGetAllConversations,
  saveConversation as localSaveConversation,
  deleteConversation as localDeleteConversation,
  deleteAllConversations as localDeleteAllConversations,
} from "@/lib/database";

import {
  readBrainConfig,
  createRemoteMemoriesRepo,
  createRemoteSkillsRepo,
  createRemoteLearnedActionsRepo,
  createRemoteRemindersRepo,
  createRemoteSystemPromptsRepo,
  createRemoteChatHistoryRepo,
  createRemoteChatRepo,
  type RemoteChatRepo,
} from "./remote";

export interface MemoriesRepo {
  getAllMemories(): Promise<Memory[]>;
  createMemory(memory: Memory): Promise<Memory>;
  deleteMemory(id: string): Promise<boolean>;
  deleteAllMemories(): Promise<boolean>;
}

export interface SkillsRepo {
  getAllSkills(): Promise<Skill[]>;
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
  createReminder(reminder: Reminder): Promise<Reminder>;
  updateReminder(reminder: Reminder): Promise<void>;
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
  saveConversation(conversation: ChatConversation): Promise<ChatConversation>;
  deleteConversation(id: string): Promise<boolean>;
  deleteAllConversations(): Promise<void>;
}

export interface ChatRepo {
  fetchAIResponse(params: {
    userMessage: string;
    history?: Message[];
    systemPrompt?: string;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

export interface Repo {
  mode: "local" | "remote";
  memories: MemoriesRepo;
  skills: SkillsRepo;
  learnedActions: LearnedActionsRepo;
  reminders: RemindersRepo;
  systemPrompts: SystemPromptsRepo;
  chatHistory: ChatHistoryRepo;
  chat: ChatRepo;
}

const localRepo: Repo = {
  mode: "local",
  memories: {
    getAllMemories: localGetAllMemories,
    createMemory: localCreateMemory,
    deleteMemory: localDeleteMemory,
    deleteAllMemories: localDeleteAllMemories,
  },
  skills: {
    getAllSkills: localGetAllSkills,
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
    createReminder: localCreateReminder,
    updateReminder: localUpdateReminder,
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
    saveConversation: localSaveConversation,
    deleteConversation: localDeleteConversation,
    deleteAllConversations: localDeleteAllConversations,
  },
  chat: {
    async *fetchAIResponse(params: {
      provider: any;
      selectedProvider: any;
      systemPrompt?: string;
      history?: Message[];
      userMessage: string;
      imagesBase64?: string[];
      signal?: AbortSignal;
    }): AsyncIterable<string> {
      const { fetchAIResponse: fn } = await import("@/lib/functions");
      yield* fn(params);
    },
  },
};

let currentConfig = readBrainConfig();
let remoteRepo: Repo | null = null;

export function getRepo(): Repo {
  const config = readBrainConfig();

  if (config.brainMode === "remote" && config.brainUrl && config.brainToken) {
    if (!remoteRepo || currentConfig.brainMode !== config.brainMode ||
        currentConfig.brainUrl !== config.brainUrl ||
        currentConfig.brainToken !== config.brainToken) {
      currentConfig = config;
      const r = createRemoteMemoriesRepo(config);
      const s = createRemoteSkillsRepo(config);
      const la = createRemoteLearnedActionsRepo(config);
      const rem = createRemoteRemindersRepo(config);
      const sp = createRemoteSystemPromptsRepo(config);
      const ch = createRemoteChatHistoryRepo(config);
      const chat = createRemoteChatRepo(config);

      remoteRepo = {
        mode: "remote",
        memories: r,
        skills: s,
        learnedActions: la,
        reminders: rem,
        systemPrompts: sp,
        chatHistory: ch,
        chat,
      };
    }
    return remoteRepo!;
  }

  return localRepo;
}

export function resetRepoCache(): void {
  currentConfig = readBrainConfig();
  remoteRepo = null;
}
