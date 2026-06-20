import type { Skill } from "@/types";
import { remoteGet, remotePost, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteSkillsRepo(config: BrainConfig) {
  return {
    async getAllSkills(): Promise<Skill[]> {
      return remoteGet<Skill[]>("/skills", config);
    },

    async getSkillById(id: number): Promise<Skill | null> {
      return remoteGet<Skill | null>(`/skills/${id}`, config);
    },

    async getSkillByName(name: string): Promise<Skill | null> {
      return remoteGet<Skill | null>(`/skills/by-name/${encodeURIComponent(name)}`, config);
    },

    async createSkill(skill: Skill): Promise<Skill> {
      return remotePost<Skill>("/skills", skill, config);
    },

    async updateSkillUseCount(id: number): Promise<void> {
      await remotePost<{ ok: boolean }>(`/skills/${id}/use`, {}, config);
    },

    async deleteSkill(id: number): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>(`/skills/${id}`, config);
      return result.ok;
    },

    async deleteAllSkills(): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>("/skills", config);
      return result.ok;
    },
  };
}

export type RemoteSkillsRepo = ReturnType<typeof createRemoteSkillsRepo>;
