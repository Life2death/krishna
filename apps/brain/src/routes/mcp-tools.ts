import type { FastifyInstance } from "fastify";
import { classifyAction, createAuditEntry, redactText } from "@krishna/core";
import type { McpHub } from "../mcp";

/**
 * Routes for MCP tool listing and execution.
 *
 * Safety: the brain is the trust boundary. Every MCP execution is classified
 * server-side; sensitive tools require an explicit `confirmed: true` round-trip.
 * All executions are logged to the audit trail.
 */
export function mcpToolsRoutes(app: FastifyInstance, hub: McpHub): void {
  /**
   * GET /mcp/tools — list all discovered MCP tools with their schemas.
   */
  app.get("/mcp/tools", async () => {
    return hub.getAllTools();
  });

  /**
   * POST /mcp/execute — execute an MCP tool by name with args.
   *
   * Body: { tool: string; args?: Record<string, string>; confirmed?: boolean }
   * - Safe tools: execute immediately.
   * - Sensitive tools: require `confirmed: true` (set after client-side
   *   confirmation round-trip); otherwise rejected with 403.
   * - Every execution is written to the audit log.
   */
  app.post("/mcp/execute", async (req, reply) => {
    const { tool, args, confirmed } = req.body as {
      tool: string;
      args?: Record<string, string>;
      confirmed?: boolean;
    };

    if (!tool) {
      return reply.code(400).send({ success: false, error: "Missing 'tool' in body" });
    }

    // Server-side classification
    const category = classifyAction(`mcp_${tool}`);
    if (category === "sensitive" && !confirmed) {
      return reply.code(403).send({
        success: false,
        error: `Sensitive MCP tool "${tool}" requires confirmation (set confirmed: true)`,
        category,
      });
    }

    const result = await hub.callTool(tool, args ?? {});

    // Audit every execution
    const redactedSummary = `MCP tool "${tool}" with args: ${JSON.stringify(args ?? {})}`;
    const { text: safeSummary } = redactText(redactedSummary);
    createAuditEntry({
      id: crypto.randomUUID(),
      actionType: `mcp_${tool}`,
      summary: safeSummary,
      result: result.success ? "ok" : `error: ${result.error ?? "unknown"}`,
      reversible: 0,
      undoPayload: null,
      createdAt: Date.now(),
    }).catch((err) => console.error("[audit] Failed to log MCP execution:", err));

    return result;
  });
}
