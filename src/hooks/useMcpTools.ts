import { useEffect, useRef, useState } from "react";
import { readBrainConfig, remoteGet, type BrainConfig } from "../lib/remote/remote-client";
import { buildMcpBridgeTools } from "@krishna/core/tools/mcp-bridge";
import { registerTools, getAllTools } from "@krishna/core/tools";

interface McpToolDef {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface UseMcpToolsResult {
  loading: boolean;
  error: string | null;
  toolCount: number;
}

/**
 * Fetches MCP tools from the brain's GET /mcp/tools endpoint and registers
 * them as Krishna bridge tools. Runs on mount whenever brainMode === "remote".
 */
export function useMcpTools(): UseMcpToolsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolCount, setToolCount] = useState(0);
  const prevConfig = useRef<string>("");

  useEffect(() => {
    const config = readBrainConfig();
    const configKey = `${config.brainMode}|${config.brainUrl}|${config.brainToken}`;
    if (configKey === prevConfig.current) return;
    prevConfig.current = configKey;

    if (config.brainMode !== "remote") {
      setToolCount(0);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const tools = await remoteGet<McpToolDef[]>("/mcp/tools", config);
        if (cancelled) return;

        const bridgeTools = buildMcpBridgeTools(
          config.brainUrl,
          config.brainToken,
          tools,
        );

        registerTools(bridgeTools);

        if (!cancelled) {
          setToolCount(getAllTools().length);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Failed to fetch MCP tools: ${msg}`);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, error, toolCount };
}
