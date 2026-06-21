import { classifyAction } from "../action-policy";
import type { Tool, ToolContext, ToolResult } from "./index";
import { getHttpFetch } from "../http";

export type ConfirmActionFn = (toolName: string) => Promise<boolean>;

let _confirmAction: ConfirmActionFn | null = null;

export const setConfirmAction = (fn: ConfirmActionFn | null): void => {
  _confirmAction = fn;
};

export const getConfirmAction = (): ConfirmActionFn | null => _confirmAction;

interface McpToolDef {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Dynamically builds Tool objects that delegate execution to the brain's
 * MCP hub via POST /mcp/execute. These are registered alongside native
 * tools in the Krishna tool registry.
 */
export function buildMcpBridgeTools(
  brainUrl: string,
  brainToken: string,
  mcpTools: McpToolDef[],
): Tool[] {
  const baseUrl = brainUrl.replace(/\/+$/, "");

  return mcpTools.map((def): Tool => ({
    name: `mcp_${def.name}`,
    description: `[${def.serverName}] ${def.description}`,
    run: async (args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> => {
      try {
        const category = classifyAction(`mcp_${def.name}`);
        let confirmed = false;

        if (category === "sensitive") {
          const confirmFn = getConfirmAction();
          if (confirmFn) {
            confirmed = await confirmFn(def.name);
            if (!confirmed) {
              return { success: false, error: "User declined this action" };
            }
          }
        }

        const httpFetch = getHttpFetch();
        const response = await httpFetch(`${baseUrl}/mcp/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${brainToken}`,
          },
          body: JSON.stringify({ tool: def.name, args, confirmed }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "Unknown error");
          const parsed = tryParseJson(text);
          if (parsed?.category === "sensitive") {
            const confirmFn = getConfirmAction();
            if (confirmFn) {
              confirmed = await confirmFn(def.name);
              if (!confirmed) {
                return { success: false, error: "User declined this action" };
              }
              const retry = await httpFetch(`${baseUrl}/mcp/execute`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${brainToken}`,
                },
                body: JSON.stringify({ tool: def.name, args, confirmed: true }),
              });
              if (!retry.ok) {
                const retryText = await retry.text().catch(() => "Unknown error");
                return { success: false, error: `Brain MCP execute failed: ${retry.status} ${retryText}` };
              }
              const retryResult = await retry.json();
              return retryResult as ToolResult;
            }
          }
          return { success: false, error: `Brain MCP execute failed: ${response.status} ${text}` };
        }

        const result = await response.json();
        return result as ToolResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `MCP bridge error: ${msg}` };
      }
    },
  }));
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
