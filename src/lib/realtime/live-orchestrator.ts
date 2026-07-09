import type { RealtimeFunctionCallDone } from "./realtime-types";
import {
  classifyRealtimeTool,
  isRealtimeToolAllowed,
  mapFunctionNameToAction,
  getRealtimeTools,
} from "./live-tool-bridge";
import { RealtimeClient } from "./realtime-client";
import { getTool } from "@krishna/core/tools";
import type { ToolResult } from "@krishna/core/tools";
import { parseYesNo } from "@krishna/core/parse-yes-no";
import { parseFastCommand as parseClassicFastCommand } from "@/lib/fast-command";
import { generateLiveInstructions } from "./realtime-instructions";
import { estimateRealtimeCost, formatCost } from "./realtime-cost";
import type { LiveVoiceSettings } from "@/lib/storage/live-voice-settings.storage";

export interface PendingAction {
  name: string;
  args: Record<string, string>;
  callId: string;
  actionName: string;
}

export function parseFastCommand(text: string): { name: string; args: Record<string, string> } | null {
  const parsed = parseClassicFastCommand(text);
  if (!parsed) return null;

  if (parsed.action.action === "open" && parsed.action.target) {
    return { name: "open_target", args: { target: parsed.action.target } };
  }

  if (parsed.action.action === "control_window" && parsed.action.target) {
    return {
      name: "control_window",
      args: {
        target: parsed.action.target,
        mode: parsed.action.mode ?? "focus",
        ...(parsed.action.monitor ? { monitor: parsed.action.monitor } : {}),
      },
    };
  }

  return null;
}

export interface OrchestratorOptions {
  onToolCallStart?: (name: string, args: Record<string, string>) => void;
  onToolCallComplete?: (name: string, result: ToolResult) => void;
  onConfirmationRequest?: (name: string, args: Record<string, string>) => void;
  onConfirmationResult?: (name: string, accepted: boolean) => void;
  onSensitiveBlocked?: (name: string, args: Record<string, string>) => void;
  onFallbackToClassic?: () => void;
  settings?: LiveVoiceSettings;
  // Confirmed user memories, preformatted (see formatMemoriesBlock), injected
  // into the session instructions so Live Voice can speak about them.
  memoryBlock?: string;
}

export class LiveOrchestrator {
  private client: RealtimeClient;
  private pendingAction: PendingAction | null = null;
  private options: OrchestratorOptions;
  private proceedAfterConfirm = false;
  private recentFastActions = new Map<string, number>();

  constructor(client: RealtimeClient, options: OrchestratorOptions = {}) {
    this.client = client;
    this.options = options;
    this.applySettings(options.settings);
  }

  private applySettings(settings?: LiveVoiceSettings): void {
    const memoryBlock = this.options.memoryBlock;

    if (!settings) {
      // No settings (e.g. dev panel) — still enrich the default instructions
      // with the user's memories so Live Voice can reference them.
      if (memoryBlock && memoryBlock.trim()) {
        this.client.config.instructions =
          this.client.config.instructions +
          "\n\nThings you know about the user (reference these naturally when relevant):\n" +
          memoryBlock.trim();
      }
      return;
    }

    const instructions = generateLiveInstructions(
      settings.language,
      undefined,
      undefined,
      memoryBlock,
    );

    this.client.config.instructions = instructions;
    this.client.config.voice = settings.voice;
    this.client.config.inactivityTimeoutMs = settings.inactivityTimeoutMs;
    this.client.config.maxSessionDurationMs = settings.maxSessionDurationMs;
    this.client.config.language = settings.language;

    this.client.tools = [];
    this.client.tools = getRealtimeTools();
  }

  updateSettings(settings: LiveVoiceSettings): void {
    this.applySettings(settings);
  }

  get isPendingConfirmation(): boolean {
    return this.pendingAction !== null;
  }

  get pending(): PendingAction | null {
    return this.pendingAction;
  }

  async interceptToolCall(call: RealtimeFunctionCallDone): Promise<void> {
    this.client.refreshActivity();
    let args: Record<string, string> = {};
    try {
      args = JSON.parse(call.arguments);
    } catch {
      args = {};
    }

    const toolName = call.name;
    const actionName = mapFunctionNameToAction(toolName);
    const sensitivity = classifyRealtimeTool(toolName);
    const actionKey = this.createActionKey(actionName, args);

    if (!isRealtimeToolAllowed(toolName)) {
      this.client.sendFunctionResponse(
        call.call_id,
        JSON.stringify({ error: `Realtime tool is not allowed: ${toolName}` }),
      );
      this.client.continueResponse();
      return;
    }

    if (this.wasRecentlyFastExecuted(actionKey)) {
      this.client.sendFunctionResponse(
        call.call_id,
        JSON.stringify({ status: "skipped", reason: "already_executed_by_fast_lane" }),
      );
      this.client.continueResponse();
      return;
    }

    this.options.onToolCallStart?.(toolName, args);

    if (sensitivity === "safe") {
      await this.executeAndRespond(toolName, actionName, args, call.call_id);
    } else {
      this.pendingAction = {
        name: toolName,
        args,
        callId: call.call_id,
        actionName,
      };
      this.options.onConfirmationRequest?.(toolName, args);
      this.client.sendFunctionResponse(
        call.call_id,
        JSON.stringify({ status: "needs_confirmation", tool: toolName, args }),
      );
    }
  }

  private async executeAndRespond(
    toolName: string,
    actionName: string,
    args: Record<string, string>,
    callId: string,
  ): Promise<void> {
    const tool = getTool(actionName);
    if (!tool) {
      this.client.sendFunctionResponse(callId, JSON.stringify({ error: `Tool not found: ${actionName}` }));
      this.client.continueResponse();
      this.options.onToolCallComplete?.(toolName, { success: false, error: `Tool not found: ${actionName}` });
      return;
    }

    const result = await tool.run(args, { vars: {} });
    this.client.markToolExecuted();
    this.options.onToolCallComplete?.(toolName, result);

    if (result.success) {
      this.client.sendFunctionResponse(callId, result.output ?? "Done");
    } else {
      this.client.sendFunctionResponse(callId, JSON.stringify({ error: result.error ?? "Tool failed" }));
    }
    this.client.continueResponse();
  }

  handleUserTranscript(text: string): void {
    if (this.pendingAction && !this.proceedAfterConfirm) {
      const decision = parseYesNo(text);
      if (decision === "yes") {
        this.proceedAfterConfirm = true;
        this.options.onConfirmationResult?.(this.pendingAction.name, true);
        const { name, actionName, args, callId } = this.pendingAction;
        void this.executeAndRespond(name, actionName, args, callId);
        this.pendingAction = null;
        this.proceedAfterConfirm = false;
        return;
      } else if (decision === "no") {
        this.options.onConfirmationResult?.(this.pendingAction.name, false);
        this.client.sendFunctionResponse(
          this.pendingAction.callId,
          JSON.stringify({ status: "cancelled", message: "User declined" }),
        );
        this.client.continueResponse();
        this.pendingAction = null;
        return;
      }
      return;
    }

    const fastCmd = parseFastCommand(text);
    if (fastCmd) {
      const actionName = mapFunctionNameToAction(fastCmd.name);
      const actionKey = this.createActionKey(actionName, fastCmd.args);
      this.options.onToolCallStart?.(fastCmd.name, fastCmd.args);
      this.client.bargeIn();
      const tool = getTool(actionName);
      if (tool) {
        tool.run(fastCmd.args, { vars: {} }).then((result) => {
          this.recentFastActions.set(actionKey, Date.now());
          this.client.markToolExecuted();
          this.options.onToolCallComplete?.(fastCmd.name, result);
        });
      }
    }
  }

  getEstimatedCostFormatted(): string {
    return this.client.getEstimatedCost();
  }

  getSessionDurationFormatted(): string {
    return this.client.getSessionDurationFormatted();
  }

  handleOffline(): void {
    this.client.callbacks.onStateChange?.("offline");
    this.options.onFallbackToClassic?.();
  }

  handleBackOnline(): void {
    if (this.pendingAction) {
      this.options.onSensitiveBlocked?.(this.pendingAction.name, this.pendingAction.args);
      this.pendingAction = null;
    }
  }

  private createActionKey(name: string, args: Record<string, string>): string {
    return `${name}:${JSON.stringify(Object.keys(args).sort().reduce<Record<string, string>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {}))}`;
  }

  private wasRecentlyFastExecuted(actionKey: string): boolean {
    const executedAt = this.recentFastActions.get(actionKey);
    if (!executedAt) return false;
    return Date.now() - executedAt < 10_000;
  }
}
