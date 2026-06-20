import type { FastifyInstance } from "fastify";
import type { McpHub } from "../mcp";

/**
 * Routes for MCP tool listing and execution.
 * These let the client discover available MCP tools and execute them
 * through the brain (which holds the MCP connections).
 *
 * Safety: the confirmation round-trip for sensitive MCP tools is handled
 * by the client-side via the existing confirmation flow. The brain just
 * executes what it's told.
 */
export function mcpToolsRoutes(app: FastifyInstance, hub: McpHub): void {
  /**
   * GET /mcp/tools — list all discovered MCP tools with their schemas.
   * The client fetches this on connect and registers them as Krishna tools.
   */
  app.get("/mcp/tools", async () => {
    return hub.getAllTools();
  });

  /**
   * POST /mcp/execute — execute an MCP tool by name with args.
   * The client calls this when the executor encounters an mcp_* tool.
   */
  app.post("/mcp/execute", async (req, reply) => {
    const { tool, args } = req.body as { tool: string; args: Record<string, string> };
    if (!tool) {
      return reply.code(400).send({ success: false, error: "Missing 'tool' in body" });
    }
    const result = await hub.callTool(tool, args ?? {});
    return result;
  });
}
