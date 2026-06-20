import type { TYPE_PROVIDER } from "@krishna/core/types";
import { config } from "./config.ts";

/**
 * Anthropic Claude provider, mirroring the client's built-in "claude" preset
 * (src/config/ai-providers.constants.ts) so /chat behaves identically to the
 * desktop app. The key is supplied server-side via env — never from clients.
 */
export const claudeProvider: TYPE_PROVIDER = {
  id: "claude",
  name: "Claude (Anthropic)",
  streaming: true,
  responseContentPath: "content[0].text",
  curl: `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: {{API_KEY}}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "{{MODEL}}",
    "system": "{{SYSTEM_PROMPT}}",
    "messages": [{"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "{{IMAGE}}"}}]}],
    "max_tokens": 1024
  }'`,
};

export function claudeSelectedProvider() {
  return {
    provider: "claude",
    variables: {
      API_KEY: config.anthropicApiKey,
      MODEL: config.claudeModel,
    },
  };
}
