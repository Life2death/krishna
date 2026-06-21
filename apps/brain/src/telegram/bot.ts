import { Telegraf } from "telegraf";
import type { BrainContext } from "../context.ts";
import { config } from "../config.ts";
import { registerHandlers } from "./handlers.ts";

let bot: Telegraf | null = null;

export function isTelegramEnabled(): boolean {
  return !!config.telegramToken;
}

export async function startBot(brainCtx: BrainContext): Promise<Telegraf | null> {
  if (!config.telegramToken) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not configured — bot disabled");
    return null;
  }

  bot = new Telegraf(config.telegramToken);

  registerHandlers(bot, brainCtx);

  bot.catch((err: unknown) => {
    console.error("[telegram] Bot error:", err);
  });

  try {
    await bot.launch();
    console.log("[telegram] Bot started — polling for updates");
  } catch (err) {
    console.error("[telegram] Failed to start bot:", err);
    return null;
  }

  return bot;
}

export async function stopBot(): Promise<void> {
  if (bot) {
    bot.stop();
    bot = null;
    console.log("[telegram] Bot stopped");
  }
}
