import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env ${name} (see apps/brain/.env.example)`);
  }
  return v.trim();
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const config = {
  port: Number(optional("KRISHNA_BRAIN_PORT", "8787")),
  token: required("KRISHNA_BRAIN_TOKEN"),

  dbPath: optional("KRISHNA_DB_PATH", "./krishna-brain.db"),
  syncUrl: optional("KRISHNA_SYNC_URL"),
  syncToken: optional("KRISHNA_SYNC_TOKEN"),
  syncInterval: Number(optional("KRISHNA_SYNC_INTERVAL", "60")),

  masterKeyEnv: optional("KRISHNA_MASTER_KEY"),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  claudeModel: optional("KRISHNA_CLAUDE_MODEL", "claude-sonnet-4-6"),

  mcpConfigPath: optional("KRISHNA_MCP_CONFIG_PATH"),
  mcpServers: optional("KRISHNA_MCP_SERVERS"),
};

export type BrainConfig = typeof config;
