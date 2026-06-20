import fs from "fs";
import type { McpServerConfig, McpConfig } from "./types";

function parseServersJson(raw: string): McpServerConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function loadMcpConfig(): McpConfig {
  const configPath = process.env.KRISHNA_MCP_CONFIG_PATH;
  if (configPath) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      return { servers: parseServersJson(content) };
    } catch {
      console.warn(`[mcp] Could not read config file: ${configPath}`);
      return { servers: [] };
    }
  }

  const envJson = process.env.KRISHNA_MCP_SERVERS;
  if (envJson) {
    return { servers: parseServersJson(envJson) };
  }

  return { servers: [] };
}
