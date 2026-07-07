import { openTargetTool } from "./open-target";
import { youtubeSearchTool } from "./youtube-search";
import { webSearchTool } from "./web-search";
import { getTravelTimeTool, suggestDepartureTimeTool } from "./get-travel-time";
import { getJobQueueTool } from "./job-queue";
import { getJobApplyTool } from "./job-apply";
import { getJobApplySubmitTool } from "./job-apply-submit";
import { gmailSearchMessagesTool, gmailReadMessageTool, gmailListLabelsTool, gmailSendEmailTool } from "./gmail";
import {
  computerTypeTool,
  computerKeyTool,
  computerClickTool,
  computerMoveTool,
  computerFocusWindowTool,
  controlWindowTool,
} from "./computer";

export interface Tool {
  name: string;
  description: string;
  run: (args: Record<string, string>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  /** Variables accumulated from prior step `out` values */
  vars: Record<string, string>;
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** If true, skip internal confirmation prompts (used for resumed actions) */
  preConfirmed?: boolean;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: Record<string, string>;
}

/**
 * Registry of all tools available to the plan executor.
 * Add new tools here as they are implemented.
 */
const tools: Map<string, Tool> = new Map();

function register(tool: Tool): void {
  tools.set(tool.name, tool);
}

export function registerTools(newTools: Tool[]): void {
  for (const tool of newTools) {
    register(tool);
  }
}

register(openTargetTool);
register(youtubeSearchTool);
register(webSearchTool);
register(getTravelTimeTool);
register(suggestDepartureTimeTool);
register(getJobQueueTool);
register(getJobApplyTool);
register(getJobApplySubmitTool);
register(gmailSearchMessagesTool);
register(gmailReadMessageTool);
register(gmailListLabelsTool);
register(gmailSendEmailTool);
register(computerTypeTool);
register(computerKeyTool);
register(computerClickTool);
register(computerMoveTool);
register(computerFocusWindowTool);
register(controlWindowTool);

export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(tools.values());
}

export function getToolDescriptions(): string {
  return Array.from(tools.values())
    .map((t) => "- " + t.name + ": " + t.description)
    .join("\n");
}
