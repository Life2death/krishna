import type { Context } from "telegraf";
import type { Message } from "@krishna/core/types";
import {
  getAllMemories,
  createMemory,
  getConversationById,
  createConversation,
  appendMessages,
  getAllConversations,
  fetchAIResponse,
} from "@krishna/core";
import type { BrainContext } from "../context.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";
import { config } from "../config.ts";

const TELEGRAM_PREFIX = "telegram_";

function telegramConvId(chatId: number | string): string {
  return `${TELEGRAM_PREFIX}${chatId}`;
}

function isTelegramConv(id: string): boolean {
  return id.startsWith(TELEGRAM_PREFIX);
}

function extractChatId(convId: string): string {
  return convId.slice(TELEGRAM_PREFIX.length);
}

async function getOrCreateConversation(
  chatId: number,
  ctx: BrainContext
): Promise<{ id: string; messages: Message[] }> {
  const convId = telegramConvId(chatId);
  const existing = await getConversationById(convId);
  if (existing) {
    const decrypted = existing.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: (ctx.crypto.decrypt(m.content as string) ?? m.content) as string,
      timestamp: m.timestamp,
    }));
    return { id: convId, messages: decrypted };
  }

  const conv = {
    id: convId,
    title: `Telegram ${chatId}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  await createConversation(conv as any);
  return { id: convId, messages: [] };
}

async function appendToConversation(
  convId: string,
  role: "user" | "assistant",
  content: string,
  crypto: BrainContext["crypto"]
): Promise<void> {
  const encrypted = crypto.encrypt(content) ?? content;
  await appendMessages(convId, [
    { role, content: encrypted, timestamp: Date.now() },
  ]);
}

export function registerHandlers(bot: any, brainCtx: BrainContext): void {
  if (!config.anthropicApiKey) {
    console.warn("[telegram] ANTHROPIC_API_KEY not set — chat commands will fail");
  }

  bot.start(async (tgCtx: Context) => {
    const name = tgCtx.from?.first_name ?? "there";
    await tgCtx.reply(
      `Hello ${name}! I am Krishna, your personal assistant.\n\n` +
        "Send me a message to chat, or use:\n" +
        "/remember <key> is <value> — save a memory\n" +
        "/memories — list saved memories\n" +
        "/forget <key> — delete a memory\n" +
        "/new — start a fresh conversation\n" +
        "/help — this message"
    );
  });

  bot.help(async (tgCtx: Context) => {
    await tgCtx.reply(
      "Commands:\n" +
        "/remember <key> is <value> — save a memory\n" +
        "/memories — list all memories\n" +
        "/forget <key> — delete a specific memory\n" +
        "/new — start a new conversation\n" +
        "/chat <message> — ask Krishna directly\n" +
        "Or just send any message to chat naturally."
    );
  });

  bot.command("remember", async (tgCtx: Context) => {
    const text = tgCtx.message && "text" in tgCtx.message ? tgCtx.message.text : "";
    const rest = text.replace(/^\/remember\s*/i, "").trim();
    if (!rest) {
      await tgCtx.reply("Usage: /remember <key> is <value>");
      return;
    }

    const sep = rest.match(/^(.*?)\s+(?:is|=)\s+(.+)$/);
    if (!sep) {
      await tgCtx.reply("Format: /remember <key> is <value>");
      return;
    }

    const key = sep[1].trim();
    const value = sep[2].trim();
    const encryptedValue = brainCtx.crypto.encrypt(value) ?? value;

    const memory = {
      id: crypto.randomUUID(),
      key,
      value: encryptedValue,
      source: "telegram",
      confirmed: 1,
      createdAt: Date.now(),
      lastUsedAt: null,
    };

    await createMemory(memory as any);
    await tgCtx.reply(`Saved: ${key} = ${value}`);
  });

  bot.command("memories", async (tgCtx: Context) => {
    const memories = await getAllMemories();
    if (memories.length === 0) {
      await tgCtx.reply("No memories saved yet.");
      return;
    }

    const lines = memories
      .filter((m) => m.confirmed)
      .slice(0, 20)
      .map((m) => {
        const value = brainCtx.crypto.decrypt(m.value as string) ?? m.value;
        return m.key ? `• ${m.key}: ${value}` : `• ${value}`;
      });

    const msg = `Memories (${memories.length} total):\n\n${lines.join("\n")}`;
    await tgCtx.reply(msg.slice(0, 4000));
  });

  bot.command("forget", async (tgCtx: Context) => {
    const text = tgCtx.message && "text" in tgCtx.message ? tgCtx.message.text : "";
    const key = text.replace(/^\/forget\s*/i, "").trim();
    if (!key) {
      await tgCtx.reply("Usage: /forget <key>");
      return;
    }

    const memories = await getAllMemories();
    const target = memories.find(
      (m) => m.key?.toLowerCase() === key.toLowerCase()
    );
    if (!target) {
      await tgCtx.reply(`No memory found with key "${key}".`);
      return;
    }

    const { deleteMemory } = await import("@krishna/core");
    await deleteMemory(target.id);
    await tgCtx.reply(`Forgot: ${key}`);
  });

  bot.command("new", async (tgCtx: Context) => {
    const chatId = tgCtx.chat!.id;
    const convId = telegramConvId(chatId);

    const existing = await getConversationById(convId);
    if (existing) {
      const { deleteConversation } = await import("@krishna/core");
      await deleteConversation(convId);
    }

    await getOrCreateConversation(chatId, brainCtx);
    await tgCtx.reply("Started a fresh conversation.");
  });

  bot.command("chat", async (tgCtx: Context) => {
    const text = tgCtx.message && "text" in tgCtx.message ? tgCtx.message.text : "";
    const userMessage = text.replace(/^\/chat\s*/i, "").trim();
    if (!userMessage) {
      await tgCtx.reply("Usage: /chat <your message>");
      return;
    }
    await handleMessage(tgCtx, userMessage, brainCtx);
  });

  bot.on("text", async (tgCtx: Context) => {
    const text = tgCtx.message && "text" in tgCtx.message ? tgCtx.message.text : "";
    if (!text) return;
    await handleMessage(tgCtx, text, brainCtx);
  });
}

async function handleMessage(
  tgCtx: Context,
  userMessage: string,
  brainCtx: BrainContext
): Promise<void> {
  if (!config.anthropicApiKey) {
    await tgCtx.reply("Krishna Brain is not configured with an AI provider key yet.");
    return;
  }

  const chatId = tgCtx.chat!.id;

  await tgCtx.sendChatAction("typing");

  const conv = await getOrCreateConversation(chatId, brainCtx);

  await appendToConversation(conv.id, "user", userMessage, brainCtx.crypto);

  const safeHistory = conv.messages.slice(-20).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let fullReply = "";
  try {
    for await (const chunk of fetchAIResponse({
      provider: claudeProvider,
      selectedProvider: claudeSelectedProvider(),
      history: safeHistory,
      userMessage,
      imagesBase64: [],
    })) {
      fullReply += chunk;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await tgCtx.reply(`Error: ${msg}`);
    return;
  }

  await appendToConversation(conv.id, "assistant", fullReply, brainCtx.crypto);

  if (fullReply.length <= 4096) {
    await tgCtx.reply(fullReply, { parse_mode: "Markdown" });
  } else {
    const parts = splitLongMessage(fullReply, 4096);
    for (const part of parts) {
      await tgCtx.reply(part, { parse_mode: "Markdown" });
    }
  }
}

function splitLongMessage(text: string, maxLen: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(". ", maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt === -1) splitAt = maxLen;
    else splitAt += 1;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
