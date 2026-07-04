import type { Tool } from "./index";
import { getSecret } from "../secrets";
import { getHttpFetch } from "../http";
import { getResponseSettings } from "../settings";
import { getVerbatimConfirm } from "./mcp-bridge";
import type { Candidate } from "./recruiter-radar";
import { MAX_CANDIDATES } from "./recruiter-radar";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const TOKENS_KEY = "GMAIL_OAUTH_TOKENS";

interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

function isTokenExpired(tokens: GmailTokens): boolean {
  if (!tokens.expiry_date) return true;
  return Date.now() >= tokens.expiry_date - 60000;
}

async function getTokens(): Promise<GmailTokens | null> {
  const raw = await getSecret(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GmailTokens;
  } catch {
    return null;
  }
}

export async function gmailFetch(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  const tokens = await getTokens();
  if (!tokens?.access_token) {
    throw new Error("GMAIL_NOT_CONFIGURED");
  }

  let accessToken = tokens.access_token;

  if (isTokenExpired(tokens) && tokens.refresh_token) {
    try {
      const result = await refreshTokens(tokens.refresh_token);
      accessToken = result.access_token;
    } catch {
      throw new Error("GMAIL_REFRESH_FAILED");
    }
  }

  const httpFetch = getHttpFetch();
  const response = await httpFetch(`${GMAIL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });

  if (response.status === 401 && !retried && tokens.refresh_token) {
    try {
      const result = await refreshTokens(tokens.refresh_token);
      return gmailFetch(path, options, true);
    } catch {
      throw new Error("GMAIL_REFRESH_FAILED");
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API error (${response.status}): ${text}`);
  }

  return response;
}

async function refreshTokens(
  refreshToken: string,
): Promise<GmailTokens> {
  const clientId = await getSecret("GMAIL_CLIENT_ID");
  const clientSecret = await getSecret("GMAIL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Gmail client credentials not configured");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const result: GmailTokens = await invoke("refresh_gmail_token", {
    clientId,
    clientSecret,
    refreshToken,
  });

  const existing = await getTokens();
  const merged: GmailTokens = {
    ...existing,
    ...result,
    refresh_token: result.refresh_token || existing?.refresh_token || refreshToken,
  };

  await persistTokens(merged);
  return merged;
}

async function persistTokens(tokens: GmailTokens): Promise<void> {
  const { secureStorage } = await import("@/lib/secure-storage");
  await secureStorage.set(TOKENS_KEY, JSON.stringify(tokens));
}

export function formatSearchOutput(
  results: SearchResult[],
  query: string,
  honorific: string,
): string {
  const label = query ? `"${query}"` : "your inbox";

  if (results.length === 0) {
    return `No messages found matching ${label}, ${honorific}.`;
  }

  const top = results[0];
  const count = results.length;
  let output = `Found ${count} message${count > 1 ? "s" : ""} matching ${label}${count > 0 ? ` — newest is from ${top.from}: "${top.subject}"` : ""}, ${honorific}.`;
  if (count > 0) {
    output += ` To read the newest one, use gmail_read with id "${top.id}".`;
  }
  return output;
}

function formatReadOutput(
  message: MessageDetail,
  honorific: string,
): string {
  const gist = message.body
    ? message.body.replace(/\s+/g, " ").trim().slice(0, 300)
    : "no content";
  const sentences = gist.split(/[.!?]+/).filter(Boolean);
  const brief = sentences.slice(0, 2).join(". ").trim();
  return `From ${message.from}, subject "${message.subject}". ${brief}${brief.length < gist.length ? "..." : ""}, ${honorific}.`;
}

function formatListLabelsOutput(
  labels: LabelInfo[],
  honorific: string,
): string {
  const count = labels.length;
  const top5 = labels.slice(0, 5).map((l) => l.name).join(", ");
  return `You have ${count} label${count > 1 ? "s" : ""}${count > 0 ? ` including ${top5}` : ""}, ${honorific}.`;
}

export interface SearchResult {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

interface MessageDetail {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  attachments: { name: string; size: number }[];
}

interface LabelInfo {
  id: string;
  name: string;
  type: string;
}

function extractHeader(
  headers: { name?: string; value?: string }[],
  name: string,
): string {
  return headers.find((h) => h.name === name)?.value ?? "";
}

function decodeBase64Url(data: string): string {
  try {
    const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    return decodeURIComponent(
      binary
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  }
}

function extractBodyFromPayload(
  payload: any,
): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBodyFromPayload(part);
      if (text) return text;
    }
  }
  return "";
}

function extractAttachments(payload: any): { name: string; size: number }[] {
  const attachments: { name: string; size: number }[] = [];
  function walk(p: any) {
    if (p.filename && p.filename !== "" && p.body?.attachmentId) {
      attachments.push({ name: p.filename, size: Number(p.body.size ?? 0) });
    }
    if (p.parts) {
      for (const part of p.parts) walk(part);
    }
  }
  walk(payload);
  return attachments;
}

async function confirmOrAbort(description: string): Promise<boolean> {
  const fn = getVerbatimConfirm();
  if (!fn) return false;
  return fn(description);
}

export function sanitizeEmailField(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function base64UrlEncode(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gmailFetchRecruiterCandidates(
  since: number,
): Promise<{ candidates: Candidate[]; capHit: boolean; inboxFallback: boolean }> {
  const sinceSec = Math.floor(since / 1000);
  let inboxFallback = false;

  async function tryFetch(query: string): Promise<{ candidates: Candidate[]; capHit: boolean }> {
    const qs = `q=${encodeURIComponent(query)}&maxResults=${MAX_CANDIDATES}`;
    const resp = await gmailFetch(`/messages?${qs}`);
    const data = await resp.json();
    const messages: { id: string }[] = data.messages ?? [];

    if (messages.length === 0) {
      return { candidates: [], capHit: false };
    }

    const results: Candidate[] = [];
    for (const msg of messages) {
      const detail = await gmailFetch(
        `/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const detailData = await detail.json();
      const headers = detailData.payload?.headers ?? [];
      results.push({
        id: msg.id,
        from: extractHeader(headers, "From"),
        subject: extractHeader(headers, "Subject"),
        snippet: detailData.snippet ?? "",
      });
    }

    return { candidates: results, capHit: messages.length >= MAX_CANDIDATES };
  }

  try {
    const result = await tryFetch(`category:primary after:${sinceSec}`);
    if (result.candidates.length > 0) {
      return { ...result, inboxFallback: false };
    }
  } catch {
    // Fall through to inbox fallback
  }

  const result = await tryFetch(`in:inbox after:${sinceSec}`);
  return { ...result, inboxFallback: true };
}

export const gmailSearchMessagesTool: Tool = {
  name: "gmail_search_messages",
  description:
    "Search Gmail inbox using Gmail search syntax. Returns message metadata (from, subject, date, snippet). " +
    'Args: query (Gmail search query), maxResults (1-50, default 10).',
  run: async (args) => {
    const query = String(args.query ?? "");
    const maxResults = Math.min(Math.max(Number(args.maxResults ?? 10), 1), 50);

    try {
      const qs = query
        ? `q=${encodeURIComponent(query)}&maxResults=${maxResults}`
        : `maxResults=${maxResults}`;
      const resp = await gmailFetch(`/messages?${qs}`);
      const data = await resp.json();
      const messages: { id: string; threadId: string }[] = data.messages ?? [];

      if (messages.length === 0) {
        return { success: true, output: `No messages found matching "${query}".` };
      }

      const results: SearchResult[] = [];
      for (const msg of messages.slice(0, maxResults)) {
        const detail = await gmailFetch(
          `/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        const detailData = await detail.json();
        const headers = detailData.payload?.headers ?? [];
        results.push({
          id: msg.id,
          threadId: msg.threadId,
          from: extractHeader(headers, "From"),
          subject: extractHeader(headers, "Subject"),
          date: extractHeader(headers, "Date"),
          snippet: detailData.snippet ?? "",
        });
      }

      const settings = getResponseSettings();
      const honorific = settings.honorific || "sir";
      const output = formatSearchOutput(results, query, honorific);

      return {
        success: true,
        output,
        data: { results: JSON.stringify(results) },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let h = "sir";
      try { h = getResponseSettings().honorific || "sir"; } catch { /* settings not available */ }
      if (msg === "GMAIL_NOT_CONFIGURED") {
        return { success: false, error: `Gmail is not connected, ${h} — check Settings.` };
      }
      if (msg === "GMAIL_REFRESH_FAILED") {
        return { success: false, error: `Gmail connection expired — reconnect in Settings, ${h}.` };
      }
      return { success: false, error: `Gmail search failed: ${msg}` };
    }
  },
};

export const gmailReadMessageTool: Tool = {
  name: "gmail_read_message",
  description:
    "Read the full content of a specific Gmail message by ID. Returns from, to, subject, date, body text, and attachment names. " +
    "Args: id (message ID from gmail_search_messages).",
  run: async (args) => {
    const id = String(args.id ?? "");
    if (!id) {
      return { success: false, error: "Missing required arg: id" };
    }

    try {
      const resp = await gmailFetch(`/messages/${id}?format=full`);
      const data = await resp.json();
      const payload = data.payload ?? {};
      const headers = payload.headers ?? [];

      const from = extractHeader(headers, "From");
      const to = extractHeader(headers, "To");
      const subject = extractHeader(headers, "Subject");
      const date = extractHeader(headers, "Date");

      const body = extractBodyFromPayload(payload);
      const attachments = extractAttachments(payload);

      const detail: MessageDetail = {
        id,
        from,
        to,
        subject,
        date,
        body: body.slice(0, 2000),
        attachments,
      };

      const settings = getResponseSettings();
      const honorific = settings.honorific || "sir";
      const output = formatReadOutput(detail, honorific);

      return {
        success: true,
        output,
        data: {
          from,
          to,
          subject,
          date,
          body: body.slice(0, 2000),
          attachments: JSON.stringify(attachments),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let h = "sir";
      try { h = getResponseSettings().honorific || "sir"; } catch { /* settings not available */ }
      if (msg === "GMAIL_NOT_CONFIGURED") {
        return { success: false, error: `Gmail is not connected, ${h} — check Settings.` };
      }
      if (msg === "GMAIL_REFRESH_FAILED") {
        return { success: false, error: `Gmail connection expired — reconnect in Settings, ${h}.` };
      }
      return { success: false, error: `Gmail read failed: ${msg}` };
    }
  },
};

export const gmailListLabelsTool: Tool = {
  name: "gmail_list_labels",
  description:
    "List all Gmail labels for the authenticated account.",
  run: async () => {
    try {
      const resp = await gmailFetch("/labels");
      const data = await resp.json();
      const labels: LabelInfo[] = (data.labels ?? []).map((l: any) => ({
        id: l.id ?? "",
        name: l.name ?? "",
        type: l.type ?? "",
      }));

      const settings = getResponseSettings();
      const honorific = settings.honorific || "sir";
      const output = formatListLabelsOutput(labels, honorific);

      return {
        success: true,
        output,
        data: { labels: JSON.stringify(labels) },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let h = "sir";
      try { h = getResponseSettings().honorific || "sir"; } catch { /* settings not available */ }
      if (msg === "GMAIL_NOT_CONFIGURED") {
        return { success: false, error: `Gmail is not connected, ${h} — check Settings.` };
      }
      if (msg === "GMAIL_REFRESH_FAILED") {
        return { success: false, error: `Gmail connection expired — reconnect in Settings, ${h}.` };
      }
      return { success: false, error: `Gmail list labels failed: ${msg}` };
    }
  },
};

export const gmailSendEmailTool: Tool = {
  name: "gmail_send_email",
  description:
    "Send an email via Gmail. Constructs and sends a plain-text email. SEND verb - user confirmation will be required. " +
    "Args: to (recipient email), subject, body (plain text), cc (optional), bcc (optional).",
  run: async (args, ctx) => {
    const to = sanitizeEmailField(String(args.to ?? ""));
    const subject = sanitizeEmailField(String(args.subject ?? ""));
    const body = String(args.body ?? "").trim();
    const cc = sanitizeEmailField(String(args.cc ?? ""));
    const bcc = sanitizeEmailField(String(args.bcc ?? ""));

    if (!to || !subject || !body) {
      return { success: false, error: "Missing required args: to, subject, body" };
    }

    if (!isValidEmail(to)) {
      return { success: false, error: `Invalid recipient email: "${to}"` };
    }
    if (cc && !isValidEmail(cc)) {
      return { success: false, error: `Invalid cc email: "${cc}"` };
    }
    if (bcc && !isValidEmail(bcc)) {
      return { success: false, error: `Invalid bcc email: "${bcc}"` };
    }

    if (!ctx?.preConfirmed && !(await confirmOrAbort(`Send email to ${to} with subject "${subject}"`))) {
      return { success: false, error: "User declined" };
    }

    try {
      const headers: string[] = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=\"UTF-8\"",
        "Content-Transfer-Encoding: 7bit",
      ];

      if (cc) headers.push(`Cc: ${cc}`);
      if (bcc) headers.push(`Bcc: ${bcc}`);

      const raw = headers.join("\r\n") + "\r\n\r\n" + body;
      const encoded = base64UrlEncode(raw);

      const resp = await gmailFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw: encoded }),
      });

      const data = await resp.json();
      const sentId = data.id ?? "";

      return {
        success: true,
        output: `Email sent to ${to} with subject "${subject}".`,
        data: { to, subject, cc: cc || "", bcc: bcc || "", id: sentId },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let h = "sir";
      try { h = getResponseSettings().honorific || "sir"; } catch { /* settings not available */ }
      if (msg === "GMAIL_NOT_CONFIGURED") {
        return { success: false, error: `Gmail is not connected, ${h} — check Settings.` };
      }
      if (msg === "GMAIL_REFRESH_FAILED") {
        return { success: false, error: `Gmail connection expired — reconnect in Settings, ${h}.` };
      }
      return { success: false, error: `Gmail send failed: ${msg}` };
    }
  },
};
