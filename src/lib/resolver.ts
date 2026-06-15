import { invoke } from "@tauri-apps/api/core";
import { resolveAppAlias } from "@/config/app-aliases";
import type { LearnedAction } from "@/types";

export interface ResolveResult {
  found: boolean;
  displayName?: string;
  target?: string;
  resolvedVia?: string;
  confidence?: number;
  learnedActionId?: string;
}

type LlmFallbackFn = (input: string) => Promise<string | null>;
type LookupLearnedFn = (input: string) => Promise<LearnedAction | null>;

export async function resolveTarget(
  input: string,
  llmFallback?: LlmFallbackFn,
  lookupLearned?: LookupLearnedFn,
): Promise<ResolveResult> {
  if (!input || !input.trim()) {
    return { found: false };
  }

  const cleaned = input.trim().toLowerCase();

  // Step 1: Check learned actions DB
  const lookup = lookupLearned ?? (await import("@/lib/database")).getLearnedActionByInput;
  const learned = await lookup(cleaned);
  if (learned) {
    return {
      found: true,
      displayName: learned.displayName,
      target: learned.target,
      resolvedVia: "learned",
      confidence: learned.confidence,
      learnedActionId: learned.id,
    };
  }

  // Step 2: Check static aliases
  const alias = resolveAppAlias(cleaned);
  if (alias) {
    return {
      found: true,
      displayName: alias.name,
      target: alias.launchCommand,
      resolvedVia: "alias",
      confidence: 1.0,
    };
  }

  // Step 3: Invoke Rust resolver (registry → StartMenu → PATH)
  try {
    const rustResult = await invoke<ResolvedApp | null>("resolve_app", { name: cleaned });
      if (rustResult && rustResult.target) {
          return {
        found: true,
        displayName: rustResult.display_name || extractName(rustResult.target),
        target: rustResult.target,
        resolvedVia: rustResult.resolved_via,
        confidence: rustResult.confidence,
      };
    }
  } catch {
    // Rust resolver failed, continue to LLM fallback
  }

  // Step 4: Optional LLM fallback
  if (llmFallback) {
    try {
      const llmTarget = await llmFallback(cleaned);
      if (llmTarget) {
        const verified = await invoke<boolean>("verify_target", { path: llmTarget });
        if (verified) {
          return {
            found: true,
            displayName: extractName(llmTarget),
            target: llmTarget,
            resolvedVia: "llm",
            confidence: 0.5,
          };
        }
      }
    } catch {
      // LLM fallback failed
    }
  }

  return { found: false };
}

export async function saveAndConfirm(
  result: ResolveResult,
  input: string,
): Promise<string | null> {
  if (!result.found || !result.target) return null;

  const { createLearnedAction } = await import("@/lib/database");
  const action: LearnedAction = {
    id: crypto.randomUUID(),
    displayName: result.displayName || extractName(result.target),
    target: result.target,
    input: input.trim().toLowerCase(),
    resolvedVia: result.resolvedVia || "unknown",
    confidence: result.confidence || 0,
    createdAt: Date.now(),
  };
  await createLearnedAction(action);
  return action.id;
}

const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".lnk", ".msi", ".vbs", ".js", ".hta"];

function isDangerousTarget(target: string): boolean {
  const lower = target.toLowerCase();
  if (lower.startsWith("\\\\")) return true;
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function needsConfirmation(result: ResolveResult): boolean {
  if (result.resolvedVia === "learned" && result.target && isDangerousTarget(result.target)) {
    return true;
  }
  return result.resolvedVia !== "learned"
    && result.resolvedVia !== "alias"
    && (result.confidence ?? 0) < 0.7;
}

interface ResolvedApp {
  display_name: string;
  target: string;
  resolved_via: string;
  confidence: number;
}

function extractName(target: string): string {
  const name = target.split(/[/\\]/).pop() || target;
  return name.replace(/\.(exe|lnk|com|bat|cmd)$/i, "");
}
