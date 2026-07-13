import type { RealtimeFunctionDefinition } from "./realtime-types";

export type Sensitivity = "safe" | "sensitive";

const REALTIME_TOOL_NAMES = new Set([
  "open_target",
  "web_search",
  "youtube_search",
  "play_music",
  "get_travel_time",
  "suggest_departure_time",
  "gmail_search_messages",
  "gmail_read_message",
  "gmail_list_labels",
  "gmail_send_email",
  "get_job_queue",
  "control_window",
  "computer_focus_window",
]);

const SENSITIVE_NAMES = new Set([
  "gmail_send_email",
  "get_travel_time",
  "suggest_departure_time",
  "gmail_send",
  "travel_time",
  "travel_best",
  "computer_type",
  "computer_click",
  "computer_key",
]);

// Window focus/move is non-destructive, so it executes immediately without a
// spoken confirmation. Truly sensitive actions (send email, type/click) stay gated.
const SENSITIVE_VERBS = new Set([
  "send", "delete", "remove", "write", "create", "post",
  "submit", "apply", "click", "type",
]);

export function classifyRealtimeTool(name: string): Sensitivity {
  if (!isRealtimeToolAllowed(name)) return "sensitive";
  if (SENSITIVE_NAMES.has(name)) return "sensitive";
  for (const v of SENSITIVE_VERBS) {
    if (name.startsWith(v)) return "sensitive";
  }
  return "safe";
}

export function isRealtimeToolAllowed(name: string): boolean {
  return REALTIME_TOOL_NAMES.has(name);
}

export function mapFunctionNameToAction(name: string): string {
  const MAPPING: Record<string, string> = {
    open_target: "open_target",
    web_search: "web_search",
    youtube_search: "youtube_search",
    play_music: "play_music",
    get_travel_time: "get_travel_time",
    suggest_departure_time: "suggest_departure_time",
    gmail_search_messages: "gmail_search_messages",
    gmail_read_message: "gmail_read_message",
    gmail_list_labels: "gmail_list_labels",
    gmail_send_email: "gmail_send_email",
    get_job_queue: "get_job_queue",
    control_window: "control_window",
    computer_focus_window: "control_window",
  };
  return MAPPING[name] ?? name;
}

export function getRealtimeTools(): RealtimeFunctionDefinition[] {
  return [
    {
      name: "open_target",
      description: "Open a URL, application, or file path",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "URL, app name, or file path to open" },
        },
        required: ["target"],
      },
    },
    {
      name: "web_search",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "youtube_search",
      description: "Search YouTube for videos",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          maxResults: { type: "string", description: "Maximum number of results (optional)" },
        },
        required: ["query"],
      },
    },
    {
      name: "play_music",
      description: "Play a song, artist, album, or playlist in YouTube Music",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Song, artist, album, or playlist to play" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_travel_time",
      description: "Get travel time and route info between two locations",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Starting location" },
          to: { type: "string", description: "Destination" },
          mode: { type: "string", description: "Travel mode (transit, driving, walking, bicycling)", enum: ["transit", "driving", "walking", "bicycling"] },
        },
        required: ["to"],
      },
    },
    {
      name: "gmail_search_messages",
      description: "Search Gmail messages by query",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          maxResults: { type: "string", description: "Maximum number of results (optional)" },
        },
        required: ["query"],
      },
    },
    {
      name: "gmail_read_message",
      description: "Read the content of a specific Gmail message by ID",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The message ID to read" },
        },
        required: ["id"],
      },
    },
    {
      name: "gmail_list_labels",
      description: "List all Gmail labels",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "gmail_send_email",
      description: "Send an email via Gmail",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
          cc: { type: "string", description: "CC recipient (optional)" },
          bcc: { type: "string", description: "BCC recipient (optional)" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "get_job_queue",
      description: "Check the current job application queue",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "control_window",
      description: "Focus or move a window on the desktop",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Window title or app name" },
          mode: { type: "string", description: "Whether to focus or move the window", enum: ["focus", "move"] },
          monitor: { type: "string", description: "Target monitor for move (optional)" },
        },
        required: ["target", "mode"],
      },
    },
  ];
}
