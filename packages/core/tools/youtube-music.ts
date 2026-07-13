import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";
import { youtubeSearchTool } from "./youtube-search";

const YOUTUBE_MUSIC_ORIGIN = "https://music.youtube.com";

function isAndroidRuntime(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function musicUrl(query: string, videoId?: string): string {
  if (videoId) return `${YOUTUBE_MUSIC_ORIGIN}/watch?v=${encodeURIComponent(videoId)}`;
  return `${YOUTUBE_MUSIC_ORIGIN}/search?q=${encodeURIComponent(query)}`;
}

/** Resolve music once, then use the same canonical Music URL on every device. */
export const youtubeMusicTool: Tool = {
  name: "play_music",
  description: "Play a song, artist, or album in YouTube Music. Prefers the installed YouTube Music Android app and falls back to music.youtube.com.",
  run: async (args, ctx) => {
    const query = args.query?.trim();
    if (!query) return { success: false, error: "Missing required arg: query" };

    const search = await youtubeSearchTool.run({ query }, ctx);
    if (!search.success) return { success: false, error: search.error ?? "Unable to resolve music" };

    const url = musicUrl(query, search.data?.videoId);
    const title = search.data?.title || query;

    try {
      if (isAndroidRuntime()) {
        const destination = await invoke<string>("android_open_youtube_music", { url });
        const output = destination === "YOUTUBE_MUSIC"
          ? `Opening ${title} in YouTube Music.`
          : `Opening ${title} in YouTube Music on the web.`;
        return { success: true, output, data: { url, title, destination } };
      }

      await invoke("open_target", { target: url });
      return { success: true, output: `Opening ${title} in YouTube Music.`, data: { url, title, destination: "WEB" } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
