export interface McpServerConfig {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
}

export interface McpConfig {
  servers: McpServerConfig[];
}

export interface McpToolInfo {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
