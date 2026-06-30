import { useEffect, useRef, useState } from "react";

interface UseMcpToolsResult {
  loading: boolean;
  error: string | null;
  toolCount: number;
}

/**
 * Phase 0: MCP tools are not loaded client-side yet (deferred to Phase 4).
 * The brain is no longer in the critical path, so there are no MCP tools to
 * fetch. This hook is a no-op placeholder; MCP relocation client-side happens
 * in Phase 4.
 */
export function useMcpTools(): UseMcpToolsResult {
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [toolCount] = useState(0);

  return { loading, error, toolCount };
}
