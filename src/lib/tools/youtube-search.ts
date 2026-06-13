import type { Tool } from "./index";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/search";

/**
 * Search YouTube via the Data API using a BYOK (bring-your-own-key) pattern.
 * Falls back to a deep-link search URL if no API key is configured.
 */
export const youtubeSearchTool: Tool = {
  name: "youtube_search",
  description: "Search YouTube for a query and return the top video ID. Requires a YouTube Data API key in settings. Falls back to deep-link search URL if no key.",
  run: async (args, ctx) => {
    const query = args.query;
    if (!query) {
      return { success: false, error: "Missing required arg: query" };
    }

    const apiKey = getYouTubeApiKey();

    if (apiKey) {
      try {
        const searchResult = await searchYouTubeApi(query, apiKey, ctx.signal);
        if (searchResult) {
          return {
            success: true,
            output: "Found video ID: " + searchResult.videoId,
            data: { videoId: searchResult.videoId, url: "https://youtube.com/watch?v=" + searchResult.videoId, title: searchResult.title, fallback: "false" } as Record<string, string>,
          };
        }
      } catch {
        // API failed, fall through to deep-link fallback
      }
    }

    const searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
    return {
      success: true,
      output: "No API key configured. Use deep-link: " + searchUrl,
      data: { url: searchUrl, videoId: "", title: "", fallback: "true" } as Record<string, string>,
    };
  },
};

interface YouTubeSearchResult {
  videoId: string;
  title: string;
}

async function searchYouTubeApi(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<YouTubeSearchResult | null> {
  const url = new URL(YOUTUBE_API_BASE);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error("YouTube API error: " + response.status + " " + response.statusText);
  }

  const data = await response.json();
  const items = data?.items;
  if (!items || items.length === 0) {
    return null;
  }

  const first = items[0];
  return {
    videoId: first.id?.videoId,
    title: first.snippet?.title,
  };
}

function getYouTubeApiKey(): string | null {
  try {
    return localStorage.getItem("youtube_api_key");
  } catch {
    return null;
  }
}