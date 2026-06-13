export interface ParsedReminder {
  text: string;
  dueAt: number;
  recurrence: string | null;
}

export function parseReminderCommand(command: string): ParsedReminder | null {
  if (!command || command.trim().length === 0) return null;

  const trimmed = command.trim();

  // Pattern 1: "remind me in N minutes/hours to <text>"
  const inMatch = trimmed.match(/^remind me\s+(?:in|after)\s+(\d+)\s*(min(?:ute)?s?|hour(?:s)?|hr(?:s)?)\s+to\s+(.+)$/i);
  if (inMatch) {
    const num = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    const text = inMatch[3].trim();
    if (!text) return null;
    let ms = 0;
    if (unit.startsWith("min")) {
      ms = num * 60000;
    } else {
      ms = num * 3600000;
    }
    return { text, dueAt: Date.now() + ms, recurrence: null };
  }

  // Pattern 2: "remind me every morning to <text>" → daily, next 9am
  const everyMorningMatch = trimmed.match(/^remind me\s+(?:every|each)\s+morning\s+to\s+(.+)$/i);
  if (everyMorningMatch) {
    const text = everyMorningMatch[1].trim();
    if (!text) return null;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return { text, dueAt: next.getTime(), recurrence: "daily" };
  }

  // Pattern 3: "remind me every day to <text>" → daily, next 24h
  const everyDayMatch = trimmed.match(/^remind me\s+(?:every|each)\s+(?:day|daily)\s+to\s+(.+)$/i);
  if (everyDayMatch) {
    const text = everyDayMatch[1].trim();
    if (!text) return null;
    return { text, dueAt: Date.now() + 86400000, recurrence: "daily" };
  }

  // Pattern 4: "remind me every week to <text>" → weekly
  const everyWeekMatch = trimmed.match(/^remind me\s+(?:every|each)\s+(?:week|weekly)\s+to\s+(.+)$/i);
  if (everyWeekMatch) {
    const text = everyWeekMatch[1].trim();
    if (!text) return null;
    return { text, dueAt: Date.now() + 604800000, recurrence: "weekly" };
  }

  // Pattern 5: "remind me tomorrow at HH:MM to <text>"
  const tomorrowAtMatch = trimmed.match(/^remind me\s+tomorrow\s+at\s+(\d{1,2}:\d{2})\s+to\s+(.+)$/i);
  if (tomorrowAtMatch) {
    const text = tomorrowAtMatch[2].trim();
    if (!text) return null;
    const timeStr = tomorrowAtMatch[1];
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, 0, 0);
    return { text, dueAt: target.getTime(), recurrence: null };
  }

  // Pattern 6: "remind me at HH:MM to <text>" → today (or tomorrow if past)
  const atMatch = trimmed.match(/^remind me\s+at\s+(\d{1,2}:\d{2})\s+to\s+(.+)$/i);
  if (atMatch) {
    const text = atMatch[2].trim();
    if (!text) return null;
    const timeStr = atMatch[1];
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return { text, dueAt: target.getTime(), recurrence: null };
  }

  // Pattern 7: "remind me to <text>" (no time) → default 1 hour
  const plainMatch = trimmed.match(/^remind me\s+to\s+(.+)$/i);
  if (plainMatch) {
    const text = plainMatch[1].trim();
    if (!text) return null;
    return { text, dueAt: Date.now() + 3600000, recurrence: null };
  }

  return null;
}
