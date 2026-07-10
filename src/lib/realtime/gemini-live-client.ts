import type { RealtimeCallbacks } from "./realtime-client";
import type {
  RealtimeConfig,
  RealtimeSessionState,
  RealtimeTimingMarks,
  RealtimeFunctionDefinition,
} from "./realtime-types";
import { DEFAULT_REALTIME_CONFIG } from "./realtime-types";
import { canTransitionTo } from "./realtime-events";
import { estimateRealtimeCost, formatCost, formatDuration } from "./realtime-cost";
import type { IRealtimeClient } from "./realtime-provider";

const GEMINI_WS_HOST =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const DEFAULT_GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";
const INPUT_SAMPLE_RATE = 16000; // Gemini Live requires 16 kHz PCM16 input
const DEFAULT_OUTPUT_RATE = 24000; // Gemini outputs 24 kHz (rate re-read per chunk)
// Gemini prebuilt voices (OpenAI voice names would be rejected at setup).
const GEMINI_VOICES = new Set([
  "Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr",
]);

/** Google Gemini Live API client, conforming to the shared IRealtimeClient. */
export class GeminiLiveClient implements IRealtimeClient {
  config: RealtimeConfig;
  callbacks: RealtimeCallbacks;
  timing: RealtimeTimingMarks;
  private ws: WebSocket | null = null;
  private apiKey = "";
  private _state: RealtimeSessionState = "idle";
  private _tools: RealtimeFunctionDefinition[] = [];
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private nextPlayTime = 0;
  private transcriptAccumulator = "";
  private userTranscripts: string[] = [];
  private pendingCallNames = new Map<string, string>();
  private durationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<RealtimeConfig>, callbacks: RealtimeCallbacks = {}) {
    this.config = { ...DEFAULT_REALTIME_CONFIG, ...config };
    this.callbacks = callbacks;
    this.timing = this.freshTiming();
  }

  private freshTiming(): RealtimeTimingMarks {
    return {
      connectStart: Date.now(),
      connectedAt: undefined,
      firstTranscriptDelta: undefined,
      firstAudioDelta: undefined,
      firstUserTranscript: undefined,
      responseCreated: undefined,
      responseDone: undefined,
      toolCallReceived: undefined,
      toolExecuted: undefined,
      disconnectStart: undefined,
      sessionStartTime: undefined,
      lastActivityTime: undefined,
      inactivityFiredAt: undefined,
      totalUserSpeechMs: 0,
      totalAssistantSpeechMs: 0,
    };
  }

  get state(): RealtimeSessionState {
    return this._state;
  }

  get tools(): RealtimeFunctionDefinition[] {
    return this._tools;
  }

  set tools(defs: RealtimeFunctionDefinition[]) {
    this._tools = defs;
  }

  setCallbacks(cbs: RealtimeCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  getTiming(): RealtimeTimingMarks {
    return { ...this.timing };
  }

  private setState(next: RealtimeSessionState): void {
    if (!canTransitionTo(this._state, next)) return;
    this._state = next;
    this.callbacks.onStateChange?.(next);
  }

  // Map the Live Voice language setting to a BCP-47 code for Gemini speechConfig.
  private languageCode(): string | undefined {
    const map: Record<string, string> = {
      english: "en-US",
      hindi: "hi-IN",
      marathi: "mr-IN",
      hinglish: "en-IN",
    };
    return map[this.config.language ?? ""];
  }

  private modelId(): string {
    const m = this.config.model || "";
    if (m.startsWith("models/")) return m;
    if (m.startsWith("gemini")) return `models/${m}`;
    return DEFAULT_GEMINI_MODEL;
  }

  async connect(apiKey?: string): Promise<void> {
    if (apiKey) this.apiKey = apiKey;
    if (!this.apiKey) {
      this.callbacks.onError?.("No API key provided");
      return;
    }
    if (this._state !== "idle") return;
    this.timing = this.freshTiming();
    this.setState("connecting");

    return new Promise<void>((resolve, reject) => {
      const url = `${GEMINI_WS_HOST}?key=${encodeURIComponent(this.apiKey)}`;
      console.info("[Gemini] connecting", this.modelId());
      let settled = false;

      // If setup never completes (bad model id / key / blocked), don't hang the
      // UI in "connecting" forever — fail out after a bounded wait.
      const timeout = setTimeout(() => {
        fail(
          new Error(
            "Gemini setup timed out (15s). Check the model id and API key.",
          ),
        );
      }, 15000);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.warn("[Gemini] connect failed:", err.message);
        this.setState("error");
        this.callbacks.onError?.(err.message, "GEMINI_CONNECT_FAILED");
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        fail(e instanceof Error ? e : new Error("WebSocket construction failed"));
        return;
      }

      this.ws.onopen = () => {
        this.sendSetup();
      };
      this.ws.onmessage = async (e: MessageEvent) => {
        try {
          const text =
            typeof e.data === "string"
              ? e.data
              : e.data instanceof Blob
                ? await e.data.text()
                : new TextDecoder().decode(e.data);
          this.handleMessage(text, succeed);
        } catch {
          /* ignore malformed frame */
        }
      };
      this.ws.onerror = () => {
        if (!settled) {
          fail(new Error("Gemini WebSocket connection error"));
        } else {
          this.callbacks.onError?.("Gemini WebSocket error", "WS_ERROR");
          this.callbacks.onFallbackToClassic?.();
        }
      };
      this.ws.onclose = (ev: CloseEvent) => {
        this.stopDurationTimer();
        console.warn("[Gemini] socket closed", ev.code, ev.reason);
        if (!settled) {
          fail(
            new Error(
              `Gemini closed before ready (code ${ev.code})${ev.reason ? ": " + ev.reason : ""}`,
            ),
          );
          this.ws = null;
          return;
        }
        if (this._state === "connected" || this._state === "speaking") {
          this.setState("idle");
          this.callbacks.onError?.(`Connection closed: ${ev.reason || ev.code}`, "WS_CLOSE");
          this.callbacks.onFallbackToClassic?.();
        } else if (this._state === "disconnecting") {
          this.setState("idle");
        }
        this.ws = null;
      };
    });
  }

  private sendSetup(): void {
    if (!this.ws) return;
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
    };
    // Pin the language so Gemini doesn't auto-mis-detect accented English as
    // Hindi/Telugu. The shared voice picker holds OpenAI voice names, which
    // Gemini rejects, so only send a voice if it's a valid Gemini voice.
    const speechConfig: Record<string, unknown> = {};
    const langCode = this.languageCode();
    if (langCode) speechConfig.languageCode = langCode;
    if (this.config.voice && GEMINI_VOICES.has(this.config.voice)) {
      speechConfig.voiceConfig = {
        prebuiltVoiceConfig: { voiceName: this.config.voice },
      };
    }
    if (Object.keys(speechConfig).length > 0) {
      generationConfig.speechConfig = speechConfig;
    }
    const setup: Record<string, unknown> = {
      model: this.modelId(),
      generationConfig,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };
    if (this.config.instructions) {
      setup.systemInstruction = { parts: [{ text: this.config.instructions }] };
    }
    if (this._tools.length > 0) {
      setup.tools = [
        {
          functionDeclarations: this._tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    console.info(
      "[Gemini] sending setup",
      this.modelId(),
      `tools=${this._tools.length}`,
    );
    this.ws.send(JSON.stringify({ setup }));
  }

  private handleMessage(text: string, resolveConnect: () => void): void {
    const msg = JSON.parse(text);
    this.refreshActivity();

    if (msg.setupComplete) {
      console.info("[Gemini] setup complete — connected");
      this.timing.connectedAt = Date.now();
      this.timing.sessionStartTime = Date.now();
      this.setState("connected");
      this.startDurationTimer();
      resolveConnect();
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;
      if (sc.outputTranscription?.text) {
        if (this.timing.firstTranscriptDelta === undefined) {
          this.timing.firstTranscriptDelta = Date.now();
        }
        this.transcriptAccumulator += sc.outputTranscription.text;
        this.callbacks.onTranscript?.(this.transcriptAccumulator, false);
        if (this._state === "connected") this.setState("speaking");
      }
      if (sc.inputTranscription?.text) {
        if (this.timing.firstUserTranscript === undefined) {
          this.timing.firstUserTranscript = Date.now();
        }
        this.userTranscripts.push(sc.inputTranscription.text);
        this.callbacks.onUserTranscript?.(sc.inputTranscription.text);
      }
      const parts: Array<{ inlineData?: { mimeType?: string; data?: string } }> =
        sc.modelTurn?.parts ?? [];
      for (const part of parts) {
        const inline = part.inlineData;
        if (inline?.data) {
          if (this.timing.firstAudioDelta === undefined) {
            this.timing.firstAudioDelta = Date.now();
          }
          const rate = this.parseRate(inline.mimeType);
          this.playAudio(inline.data, rate);
          this.callbacks.onAudio?.(inline.data);
          this.callbacks.onAudioDelta?.(inline.data);
          if (this._state === "connected") this.setState("speaking");
        }
      }
      if (sc.interrupted) {
        this.nextPlayTime = 0; // drop queued playback on barge-in
      }
      if (sc.turnComplete) {
        this.timing.responseDone = Date.now();
        this.callbacks.onResponseDone?.({ usage: undefined });
        if (this.transcriptAccumulator) {
          this.callbacks.onTranscript?.(this.transcriptAccumulator, true);
        }
        this.transcriptAccumulator = "";
        if (this._state === "speaking") this.setState("connected");
      }
      return;
    }

    if (msg.toolCall?.functionCalls) {
      this.timing.toolCallReceived = Date.now();
      for (const fc of msg.toolCall.functionCalls) {
        if (fc.id) this.pendingCallNames.set(fc.id, fc.name);
        this.callbacks.onFunctionCall?.({
          type: "response.function_call_arguments.done",
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
          call_id: fc.id ?? fc.name,
          response_id: "",
          item_id: "",
          output_index: 0,
        });
      }
      return;
    }

    if (msg.error) {
      console.error("[Gemini] error message", msg.error);
      this.setState("error");
      this.callbacks.onError?.(
        msg.error.message ?? "Gemini error",
        String(msg.error.code ?? ""),
      );
      return;
    }

    if (!msg.serverContent && !msg.toolCall && !msg.setupComplete) {
      console.warn("[Gemini] unhandled message", Object.keys(msg));
    }
  }

  private parseRate(mimeType?: string): number {
    const m = mimeType?.match(/rate=(\d+)/);
    return m ? Number(m[1]) : DEFAULT_OUTPUT_RATE;
  }

  async startRecording(stream: MediaStream): Promise<void> {
    this.micStream = stream;
    this.audioContext = this.ensureAudioContext();
    this.micSource = this.audioContext.createMediaStreamSource(stream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.micSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
    this.scriptProcessor.onaudioprocess = (e) => {
      if (this._state !== "connected" && this._state !== "speaking") return;
      const pcm = this.floatTo16BitPcm(e.inputBuffer.getChannelData(0));
      this.sendAudio(this.arrayBufferToBase64(pcm.buffer));
    };
  }

  sendAudio(base64: string): void {
    if (this._state !== "connected" && this._state !== "speaking") return;
    this.ws?.send(
      JSON.stringify({
        realtimeInput: {
          audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
        },
      }),
    );
  }

  sendFunctionResponse(callId: string, output: string): void {
    if (!this.ws) return;
    let response: unknown;
    try {
      response = JSON.parse(output);
    } catch {
      response = { result: output };
    }
    this.ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [
            { id: callId, name: this.pendingCallNames.get(callId) ?? "", response },
          ],
        },
      }),
    );
    this.pendingCallNames.delete(callId);
  }

  // Gemini continues automatically after a tool response / VAD turn end.
  continueResponse(): void {}
  commitAudio(): void {}
  clearAudioBuffer(): void {}
  cancelResponse(): void {
    this.nextPlayTime = 0;
  }
  bargeIn(): void {
    this.nextPlayTime = 0;
  }

  markToolExecuted(): void {
    this.timing.toolExecuted = Date.now();
  }

  refreshActivity(): void {
    this.timing.lastActivityTime = Date.now();
  }

  disconnect(): void {
    this.stopRecording();
    this.stopDurationTimer();
    if (!this.ws || this._state === "idle") {
      this.setState("idle");
      return;
    }
    this.timing.disconnectStart = Date.now();
    this.setState("disconnecting");
    this.ws.close();
  }

  stopRecording(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.nextPlayTime = 0;
    this.transcriptAccumulator = "";
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  private playAudio(base64: string, rate: number): void {
    try {
      const ctx = this.ensureAudioContext();
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const sampleCount = Math.floor(bytes.byteLength / 2);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
      const buffer = ctx.createBuffer(1, sampleCount, rate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) channel[i] = pcm16[i] / 0x8000;
      const durationMs = (sampleCount / rate) * 1000;
      this.timing.totalAssistantSpeechMs += durationMs;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      if (this.nextPlayTime < ctx.currentTime) this.nextPlayTime = ctx.currentTime;
      src.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
    } catch (e) {
      this.callbacks.onError?.(
        e instanceof Error ? e.message : "Audio playback failed",
        "AUDIO_PLAYBACK_FAILED",
      );
    }
  }

  private floatTo16BitPcm(input: Float32Array): Int16Array {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationTimer = setInterval(() => {
      const max = this.config.maxSessionDurationMs;
      if (max && max > 0 && this.getSessionDurationMs() >= max) this.disconnect();
    }, 5000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer !== null) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  getSessionDurationMs(): number {
    if (!this.timing.sessionStartTime) return 0;
    const end = this.timing.disconnectStart ?? Date.now();
    return end - this.timing.sessionStartTime;
  }

  getSessionDurationFormatted(): string {
    return formatDuration(this.getSessionDurationMs());
  }

  getEstimatedCost(): string {
    const cost = estimateRealtimeCost(
      this.timing.totalUserSpeechMs,
      this.timing.totalAssistantSpeechMs,
      this.config.model,
    );
    return formatCost(cost.estimatedCostUsd);
  }

  getTranscriptHistory(): string[] {
    return [...this.userTranscripts];
  }

  resetTiming(): void {
    this.timing = this.freshTiming();
  }
}
