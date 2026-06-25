import type { McpToolInfo } from "../mcp/types";
import type { ToolResult } from "../../../../packages/core/tools/index";
import type { gmail_v1 } from "googleapis";

interface GmailProviderContext {
  gmail: gmail_v1.Gmail;
}

function makeTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: (args: Record<string, unknown>, ctx: GmailProviderContext) => Promise<ToolResult>,
): { info: McpToolInfo; handler: typeof handler } {
  return {
    info: { serverName: "gmail", name, description, inputSchema },
    handler,
  };
}

async function searchMessages(
  args: Record<string, unknown>,
  ctx: GmailProviderContext,
): Promise<ToolResult> {
  const query = String(args.query ?? "");
  const maxResults = Math.min(Math.max(Number(args.maxResults ?? 10), 1), 50);

  if (!query) {
    return { success: false, error: "Missing required arg: query" };
  }

  const res = await ctx.gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = res.data.messages ?? [];

  if (messages.length === 0) {
    return { success: true, output: "No messages found matching the query." };
  }

  const results = [];
  for (const msg of messages) {
    const detail = await ctx.gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = detail.data.payload?.headers ?? [];
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";
    results.push({
      id: msg.id!,
      threadId: detail.data.threadId!,
      from,
      subject,
      date,
      snippet: detail.data.snippet ?? "",
    });
  }

  return {
    success: true,
    output: `Found ${results.length} message(s) matching "${query}".`,
    data: { results: JSON.stringify(results) },
  };
}

async function readMessage(
  args: Record<string, unknown>,
  ctx: GmailProviderContext,
): Promise<ToolResult> {
  const id = String(args.id ?? "");
  if (!id) {
    return { success: false, error: "Missing required arg: id" };
  }

  const res = await ctx.gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });

  const payload = res.data.payload!;
  const headers = payload.headers ?? [];
  const from = headers.find((h) => h.name === "From")?.value ?? "";
  const to = headers.find((h) => h.name === "To")?.value ?? "";
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
  const date = headers.find((h) => h.name === "Date")?.value ?? "";

  const body = extractTextBody(payload);
  const attachments = extractAttachmentInfo(payload);

  const summary = `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${date}\n\n${(body ?? "").slice(0, 2000)}${(body?.length ?? 0) > 2000 ? "\n... (truncated)" : ""}`;

  return {
    success: true,
    output: summary,
    data: {
      from,
      to,
      subject,
      date,
      body: body ?? "",
      attachments: JSON.stringify(attachments),
    },
  };
}

async function listLabels(
  _args: Record<string, unknown>,
  ctx: GmailProviderContext,
): Promise<ToolResult> {
  const res = await ctx.gmail.users.labels.list({ userId: "me" });
  const labels = (res.data.labels ?? []).map((l) => ({
    id: l.id!,
    name: l.name!,
    type: l.type!,
  }));

  return {
    success: true,
    output: `Found ${labels.length} labels.`,
    data: { labels: JSON.stringify(labels) },
  };
}

async function sendEmail(
  args: Record<string, unknown>,
  ctx: GmailProviderContext,
): Promise<ToolResult> {
  const to = String(args.to ?? "").trim();
  const subject = String(args.subject ?? "").trim();
  const body = String(args.body ?? "").trim();
  const cc = String(args.cc ?? "").trim();
  const bcc = String(args.bcc ?? "").trim();

  if (!to || !subject || !body) {
    return { success: false, error: "Missing required args: to, subject, body" };
  }

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
  const encoded = Buffer.from(raw, "utf8").toString("base64url");

  await ctx.gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return {
    success: true,
    output: `Email sent to ${to} with subject "${subject}".`,
    data: { to, subject, cc: cc || "", bcc: bcc || "" },
  };
}

function extractTextBody(payload: any): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64url").toString("utf8");
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }

  return "";
}

function extractAttachmentInfo(payload: any): { name: string; size: number }[] {
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

export function createGmailProvider(gmail: gmail_v1.Gmail) {
  const ctx: GmailProviderContext = { gmail };

  const tools = [
    makeTool(
      "gmail_search_messages",
      "Search Gmail inbox using Gmail search syntax. Returns message metadata (from, subject, date, snippet).",
      {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query (e.g. 'from:john is:unread')" },
          maxResults: { type: "number", description: "Max results (1-50, default 10)" },
        },
        required: ["query"],
      },
      searchMessages,
    ),
    makeTool(
      "gmail_read_message",
      "Read the full content of a specific Gmail message by ID. Returns from, to, subject, date, body text, and attachment names.",
      {
        type: "object",
        properties: {
          id: { type: "string", description: "Message ID from gmail_search_messages" },
        },
        required: ["id"],
      },
      readMessage,
    ),
    makeTool(
      "gmail_list_labels",
      "List all Gmail labels for the authenticated account.",
      {
        type: "object",
        properties: {},
      },
      listLabels,
    ),
    makeTool(
      "gmail_send_email",
      "Send an email via Gmail. Constructs and sends a plain-text email. SEND verb - user confirmation will be required.",
      {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body text (plain text)" },
          cc: { type: "string", description: "CC recipient (optional)" },
          bcc: { type: "string", description: "BCC recipient (optional)" },
        },
        required: ["to", "subject", "body"],
      },
      sendEmail,
    ),
  ];

  return {
    tools: tools.map((t) => t.info),
    call: async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      const tool = tools.find((t) => t.info.name === name);
      if (!tool) {
        return { success: false, error: `Gmail tool "${name}" not found` };
      }
      try {
        return await tool.handler(args, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Gmail tool "${name}" failed: ${msg}` };
      }
    },
  };
}
