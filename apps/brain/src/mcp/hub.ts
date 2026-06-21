import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerConfig, McpToolInfo } from "./types";
import type { Tool } from "../../../../packages/core/tools/index";
import type { ToolContext, ToolResult } from "../../../../packages/core/tools/index";
import type { Hub as WsHub } from "../ws";

const IDLE_TIMEOUT_MS = 300_000;

interface McpConnection {
  serverName: string;
  client: Client;
  tools: McpToolInfo[];
  lastUsed: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Manages MCP client connections — connect on boot, discover tools,
 * keep-alive, idle-timeout disconnected ones, execute tool calls.
 */
export class McpHub {
  private connections = new Map<string, McpConnection>();
  private wsHub?: WsHub;

  setWsHub(hub: WsHub): void {
    this.wsHub = hub;
  }

  async connectAll(servers: McpServerConfig[]): Promise<void> {
    for (const cfg of servers) {
      try {
        await this.connectOne(cfg);
      } catch (err) {
        console.error(`[mcp] Failed to connect "${cfg.name}":`, err);
      }
    }
  }

  private async connectOne(cfg: McpServerConfig): Promise<void> {
    const client = new Client(
      { name: "krishna-brain-mcp", version: "1.0.0" },
      { capabilities: {} },
    );

    let transport;
    if (cfg.transport === "stdio") {
      if (!cfg.command) throw new Error(`stdio transport requires "command" for server "${cfg.name}"`);
      transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
      });
    } else if (cfg.transport === "sse") {
      if (!cfg.url) throw new Error(`sse transport requires "url" for server "${cfg.name}"`);
      transport = new SSEClientTransport(new URL(cfg.url));
    } else {
      throw new Error(`Unknown transport "${cfg.transport}" for server "${cfg.name}"`);
    }

    await client.connect(transport);

    const result = await client.listTools();
    const tools: McpToolInfo[] = (result?.tools ?? []).map((t: any) => ({
      serverName: cfg.name,
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? {},
    }));

    const conn: McpConnection = {
      serverName: cfg.name,
      client,
      tools,
      lastUsed: Date.now(),
    };
    this.connections.set(cfg.name, conn);
    this.resetIdleTimer(conn);

    console.log(`[mcp] Connected "${cfg.name}" — ${tools.length} tools discovered`);
  }

  private resetIdleTimer(conn: McpConnection): void {
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    conn.idleTimer = setTimeout(() => {
      this.disconnect(conn.serverName);
    }, IDLE_TIMEOUT_MS);
  }

  private disconnect(name: string): void {
    const conn = this.connections.get(name);
    if (!conn) return;
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    conn.client.close().catch(() => {});
    this.connections.delete(name);
    console.log(`[mcp] Disconnected idle server "${name}"`);
  }

  /** Get all discovered MCP tools across all connected servers. */
  getAllTools(): McpToolInfo[] {
    const all: McpToolInfo[] = [];
    for (const conn of this.connections.values()) {
      conn.lastUsed = Date.now();
      this.resetIdleTimer(conn);
      all.push(...conn.tools);
    }
    return all;
  }

  /** Execute an MCP tool. Supports `server.tool` qualified names for disambiguation. */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const dotIdx = toolName.indexOf(".");
    let serverName: string | null = null;
    let bareName = toolName;

    if (dotIdx > 0) {
      serverName = toolName.slice(0, dotIdx);
      bareName = toolName.slice(dotIdx + 1);
    }

    for (const conn of this.connections.values()) {
      if (serverName && conn.serverName !== serverName) continue;
      const match = conn.tools.find((t) => t.name === bareName);
      if (!match) continue;

      conn.lastUsed = Date.now();
      this.resetIdleTimer(conn);

      try {
        const result = await conn.client.callTool({
          name: bareName,
          arguments: args,
        });
        const content = (result as any)?.content ?? [];
        const text = content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
        return { success: true, output: text, data: { raw: JSON.stringify(result) } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `MCP tool "${toolName}" failed: ${msg}` };
      }
    }

    return { success: false, error: `MCP tool "${toolName}" not found on any connected server` };
  }

  /** Build Tool-compatible wrappers for all MCP tools. */
  asKrishnaTools(): Tool[] {
    return this.getAllTools().map((mcpTool) => ({
      name: `mcp_${mcpTool.name}`,
      description: `[${mcpTool.serverName}] ${mcpTool.description}`,
      run: async (args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> => {
        const result = await this.callTool(mcpTool.name, args);
        if (this.wsHub) {
          this.wsHub.broadcast("mcp-tools", "save", {
            tool: mcpTool.name,
            server: mcpTool.serverName,
            success: result.success,
            output: result.output,
            timestamp: Date.now(),
          });
        }
        return result;
      },
    }));
  }

  async disconnectAll(): Promise<void> {
    for (const [name] of this.connections) {
      this.disconnect(name);
    }
  }
}
