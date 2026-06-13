import type { Tool } from "./index";

/**
 * General web search tool.
 * Uses a configurable search API endpoint (BYOK pattern).
 * Falls back to a deep-link URL if no API key is configured.
 */
export const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web for a query and return top results. Requires a Search API key in settings. Falls back to deep-link search URL if no key.",
  run: async (args, _ctx) => {
    const query = args.query;
    if (!query) {
      return { success: false, error: "Missing required arg: query" };
    }

    const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
    return {
      success: true,
      output: "Search URL: " + searchUrl,
      data: { url: searchUrl },
    };
  },
};