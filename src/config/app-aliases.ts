export interface AppAlias {
  name: string;
  aliases: string[];
  launchCommand: string;
  type: "app" | "url";
  url?: string;
}

export const APP_ALIASES: AppAlias[] = [
  {
    name: "Notepad",
    aliases: ["notepad", "notepad++", "text editor", "editor"],
    launchCommand: "notepad",
    type: "app",
  },
  {
    name: "Chrome",
    aliases: ["chrome", "google chrome", "browser", "web browser"],
    launchCommand: "chrome",
    type: "app",
  },
  {
    name: "Edge",
    aliases: ["edge", "microsoft edge", "ms edge"],
    launchCommand: "msedge",
    type: "app",
  },
  {
    name: "VS Code",
    aliases: ["vscode", "visual studio code", "code", "vs code"],
    launchCommand: "code",
    type: "app",
  },
  {
    name: "Calculator",
    aliases: ["calculator", "calc"],
    launchCommand: "calc",
    type: "app",
  },
  {
    name: "File Explorer",
    aliases: ["explorer", "file explorer", "files", "folder"],
    launchCommand: "explorer",
    type: "app",
  },
  {
    name: "Command Prompt",
    aliases: ["cmd", "command prompt", "terminal", "console"],
    launchCommand: "cmd",
    type: "app",
  },
  {
    name: "PowerShell",
    aliases: ["powershell", "pwsh"],
    launchCommand: "powershell",
    type: "app",
  },
  {
    name: "Spotify",
    aliases: ["spotify", "music"],
    launchCommand: "spotify",
    type: "app",
  },
  {
    name: "Control Panel",
    aliases: ["control panel", "settings", "system settings"],
    launchCommand: "control",
    type: "app",
  },
];

export function resolveAppAlias(input: string): AppAlias | null {
  const lower = input.toLowerCase().trim();
  for (const alias of APP_ALIASES) {
    if (alias.aliases.some((a) => lower === a || lower.startsWith(a + " "))) {
      return alias;
    }
  }
  return null;
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input) || /^[a-z0-9]([-a-z0-9]*[a-z0-9])?\.[a-z]{2,}/i.test(input);
}

export function isFilePath(input: string): boolean {
  return /^[a-zA-Z]:\\/.test(input) || /^[\/~]/.test(input);
}
