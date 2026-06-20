import type { Tool, ToolContext, ToolResult } from "./index";
import { getHttpFetch } from "../http";

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
        const httpFetch = getHttpFetch();
        const response = await httpFetch(`${baseUrl}/mcp/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${brainToken}`,
          },
          body: JSON.stringify({ tool: def.name, args }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "Unknown error");
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
