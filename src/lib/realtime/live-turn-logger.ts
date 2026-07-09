import { insertPendingCommand, updateCommandOutcome } from "@/lib/database";
import {
  createConversation,
  appendMessages,
  generateConversationTitle,
} from "@/lib/repo-bound";
import { TurnTiming } from "@/lib/turn-timing";
import { estimateCostFromTokens } from "./realtime-cost";
import type { RealtimeUsage } from "./realtime-types";

// Group consecutive Live Voice turns into one conversation unless the user has
// been idle longer than this (mirrors the classic pipeline's recordTurn).
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

interface PendingTurn {
  userText: string;
  assistantText: string;
  endOfSpeech?: number;
  requestSent?: number;
  firstToken?: number;
  firstAudio?: number;
}

export interface LiveSessionTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Captures everything going in and out of a Live Voice session and persists it
 * the same way the classic pipeline does: one `command_log` row per turn (so it
 * appears in the Turn Latency table) plus a conversation entry (so it appears in
 * the Dashboard history). The UI feeds it from the RealtimeClient callbacks.
 */
export class LiveTurnLogger {
  private readonly model: string;
  private turn: PendingTurn = { userText: "", assistantText: "" };
  private activeConversationId: string | null = null;
  private lastTurnAt = 0;
  private totals: LiveSessionTotals = {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  private readonly onTotals?: (t: LiveSessionTotals) => void;

  constructor(model: string, onTotals?: (t: LiveSessionTotals) => void) {
    this.model = model;
    this.onTotals = onTotals;
  }

  /** User utterance finished transcribing (input_audio_transcription.completed). */
  handleUserTranscript(text: string): void {
    this.turn.userText = text;
    this.turn.endOfSpeech = Date.now();
  }

  /** Model began responding (response.created) — turn boundary. */
  handleResponseCreated(): void {
    this.turn.requestSent = Date.now();
    this.turn.firstToken = undefined;
    this.turn.firstAudio = undefined;
  }

  /** Accumulated assistant transcript so far. */
  handleTranscript(accumulated: string): void {
    if (this.turn.firstToken === undefined) this.turn.firstToken = Date.now();
    if (accumulated) this.turn.assistantText = accumulated;
  }

  /** First (and subsequent) audio chunk played back. */
  handleAudioDelta(): void {
    if (this.turn.firstAudio === undefined) this.turn.firstAudio = Date.now();
  }

  /** Response completed (response.done) — persist the turn. */
  async handleResponseDone(usage?: RealtimeUsage): Promise<void> {
    const t = this.turn;
    const now = Date.now();
    const userText = t.userText.trim();
    const assistantText = t.assistantText.trim();
    // Reset immediately so the next turn starts clean even if persistence awaits.
    this.turn = { userText: "", assistantText: "" };
    if (!userText && !assistantText) return;

    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cachedTokens = usage?.input_token_details?.cached_tokens ?? 0;
    if (inputTokens || outputTokens) {
      this.totals.inputTokens += inputTokens;
      this.totals.outputTokens += outputTokens;
      this.totals.costUsd += estimateCostFromTokens(
        inputTokens,
        outputTokens,
        this.model,
      );
    }
    this.totals.turns += 1;
    this.onTotals?.({ ...this.totals });

    // Per-turn timing — all marks share the Date.now() ms domain so deltas hold.
    // The user-transcript event can arrive after response.created, so anchor
    // end-of-speech to whichever came first to avoid negative deltas.
    const timing = new TurnTiming();
    const endOfSpeech = Math.min(
      t.endOfSpeech ?? Number.POSITIVE_INFINITY,
      t.requestSent ?? Number.POSITIVE_INFINITY,
    );
    timing.markAt(
      "end_of_speech",
      Number.isFinite(endOfSpeech) ? endOfSpeech : now,
    );
    if (t.requestSent) timing.markAt("request_sent", t.requestSent);
    if (t.firstToken) timing.markAt("first_token", t.firstToken);
    if (t.firstAudio) timing.markAt("first_audio", t.firstAudio);
    timing.markAt("last_token", now);
    timing.markAt("last_audio", now);
    if (inputTokens || outputTokens) {
      timing.setUsage({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        cache_read_input_tokens: cachedTokens,
      });
    }
    timing.freeze();

    // command_log — one row per turn (Turn Latency table + speech log).
    const id = crypto.randomUUID();
    try {
      await insertPendingCommand({
        id,
        transcript: userText || "(no speech)",
        source: "live",
        createdAt: now,
      });
      await updateCommandOutcome({
        id,
        outcome: "answered",
        response: assistantText || null,
        timing: timing.toJSON(),
      });
    } catch (e) {
      console.error("[LiveTurnLogger] command_log write failed:", e);
    }

    // Conversation history — so the exchange shows up in the Dashboard.
    try {
      const idle = now - this.lastTurnAt;
      if (!this.activeConversationId || idle > IDLE_THRESHOLD_MS) {
        const conv = await createConversation({
          id: crypto.randomUUID(),
          title: generateConversationTitle(userText || assistantText),
          createdAt: now,
          updatedAt: now,
          messages: [],
        });
        this.activeConversationId = conv.id;
      }
      const messages: {
        role: "user" | "assistant";
        content: string;
        timestamp: number;
      }[] = [];
      if (userText) messages.push({ role: "user", content: userText, timestamp: now });
      if (assistantText)
        messages.push({ role: "assistant", content: assistantText, timestamp: now + 1 });
      if (messages.length) await appendMessages(this.activeConversationId, messages);
      this.lastTurnAt = now;
    } catch (e) {
      console.error("[LiveTurnLogger] conversation write failed:", e);
    }
  }

  getTotals(): LiveSessionTotals {
    return { ...this.totals };
  }
}
