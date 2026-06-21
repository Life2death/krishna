import { openTargetTool } from "./open-target";
import { youtubeSearchTool } from "./youtube-search";
import { webSearchTool } from "./web-search";
import {
  computerTypeTool,
  computerKeyTool,
  computerClickTool,
  computerMoveTool,
  computerFocusWindowTool,
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
