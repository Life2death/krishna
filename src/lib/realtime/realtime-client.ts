import type {
  RealtimeConfig,
  RealtimeEvent,
  RealtimeSessionState,
  RealtimeTimingMarks,
  RealtimeFunctionDefinition,
  RealtimeFunctionCallDone,
} from "./realtime-types";
import { DEFAULT_REALTIME_CONFIG } from "./realtime-types";
import {
  isTranscriptDelta,
  isTranscriptDone,
  isAudioDelta,
  isAudioDone,
  isSpeechStarted,
  isSpeechStopped,
  isUserTranscript,
  isResponseCreated,
  isResponseDone,
  isErrorEvent,
  isFunctionCallDone,
  canTransitionTo,
} from "./realtime-events";

export type RealtimeEventHandler = (event: RealtimeEvent) => void;
export type StateChangeHandler = (state: RealtimeSessionState) => void;
export type TranscriptHandler = (text: string, isFinal: boolean) => void;
export type AudioHandler = (base64: string) => void;
export type UserTranscriptHandler = (text: string) => void;
export type FunctionCallHandler = (call: RealtimeFunctionCallDone) => void;

export interface RealtimeCallbacks {
  onEvent?: RealtimeEventHandler;
  onStateChange?: StateChangeHandler;
  onTranscript?: TranscriptHandler;
  onAudio?: AudioHandler;
  onAudioDelta?: AudioHandler;
  onUserTranscript?: UserTranscriptHandler;
  onFunctionCall?: FunctionCallHandler;
  onError?: (msg: string, code?: string) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private config: RealtimeConfig;
  private apiKey: string = "";
  private _state: RealtimeSessionState = "idle";
  callbacks: RealtimeCallbacks;
  timing: RealtimeTimingMarks;
  private userTranscripts: string[] = [];
  private _tools: RealtimeFunctionDefinition[] = [];
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private nextPlayTime = 0;
  private transcriptAccumulator = "";

  constructor(
    config?: Partial<RealtimeConfig>,
    callbacks: RealtimeCallbacks = {},
  ) {
    this.config = { ...this.defaultConfig(), ...config };
    this.callbacks = callbacks;
    this.timing = this.freshTiming();
  }

  private defaultConfig(): RealtimeConfig {
    return DEFAULT_REALTIME_CONFIG;
  }

  setCallbacks(cbs: RealtimeCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cbs };
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
    if (this._state === "connected" || this._state === "speaking") {
      this.sendSessionUpdate();
    }
  }

  getTiming(): RealtimeTimingMarks {
    return { ...this.timing };
  }

  private setState(next: RealtimeSessionState): void {
    if (!canTransitionTo(this._state, next)) {
      return;
    }
    this._state = next;
    this.callbacks.onStateChange?.(next);
  }

  private detectOffline(): void {
    this.setState("offline");
    this.offlineTimer = setTimeout(() => {
      this.disconnect();
    }, 10_000);
  }

  private clearOfflineTimer(): void {
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }
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
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
      let opened = false;

      try {
        this.ws = new WebSocket(url, [
          "realtime",
          `openai-insecure-api-key.${this.apiKey}`,
        ]);
      } catch (error) {
        this.setState("error");
        reject(error instanceof Error ? error : new Error("WebSocket construction failed"));
        return;
      }

      this.ws.onopen = () => {
        opened = true;
        this.timing.connectedAt = Date.now();
        this.setState("connected");
        this.sendSessionUpdate();
        resolve();
      };

      this.ws.onmessage = (msg) => {
        if (typeof msg.data !== "string") return;
        try {
          const parsed: RealtimeEvent = JSON.parse(msg.data);
          this.routeEvent(parsed);
          this.callbacks.onEvent?.(parsed);
        } catch {
          // ignore malformed realtime events
        }
      };

      this.ws.onclose = (event) => {
        this.clearOfflineTimer();
        if (!opened) {
          this.setState("error");
          reject(new Error(`Connection closed before ready: ${event.reason || `code ${event.code}`}`));
          return;
        }
        this.setState("idle");
        this.ws = null;
      };

      this.ws.onerror = () => {
        this.clearOfflineTimer();
        if (!opened) {
          this.setState("error");
          reject(new Error("WebSocket connection error"));
          return;
        }
        if (navigator.onLine === false) {
          this.detectOffline();
          return;
        }
        this.setState("error");
      };
    });
  }

  disconnect(): void {
    this.stopRecording();
    if (!this.ws || this._state === "idle") return;
    this.timing.disconnectStart = Date.now();
    this.setState("disconnecting");
    this.clearOfflineTimer();
    this.ws.close();
  }

  sendAudio(base64: string): void {
    if (this._state !== "connected" && this._state !== "speaking") return;
    this.ws?.send(
      JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }),
    );
  }

  commitAudio(): void {
    if (this._state !== "connected" && this._state !== "speaking") return;
    this.ws?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  }

  clearAudioBuffer(): void {
    this.ws?.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  }

  cancelResponse(): void {
    this.ws?.send(JSON.stringify({ type: "response.cancel" }));
  }

  bargeIn(): void {
    this.cancelResponse();
    this.clearAudioBuffer();
  }

  sendFunctionResponse(callId: string, output: string): void {
    this.ws?.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output,
        },
      }),
    );
  }

  continueResponse(): void {
    this.ws?.send(JSON.stringify({ type: "response.create" }));
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const session: Record<string, unknown> = {
      type: "realtime",
      output_modalities: ["audio"],
      instructions: this.config.instructions,
      audio: {
        input: {
          format: this.toRealtimeAudioFormat(this.config.inputAudioFormat),
          transcription: this.config.inputAudioTranscription,
          turn_detection: this.config.turnDetection,
        },
        output: {
          format: this.toRealtimeAudioFormat(this.config.outputAudioFormat),
          voice: this.config.voice,
        },
      },
      max_output_tokens: this.config.maxResponseOutputTokens,
    };

    if (this._tools.length > 0) {
      session.tools = this._tools.map((t) => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      session.tool_choice = "auto";
    }

    const payload = {
      type: "session.update",
      session,
    };
    this.ws.send(JSON.stringify(payload));
  }

  private toRealtimeAudioFormat(
    format: RealtimeConfig["inputAudioFormat"],
  ): { type: string; rate: number } {
    switch (format) {
      case "g711_ulaw":
        return { type: "audio/pcmu", rate: 8000 };
      case "g711_alaw":
        return { type: "audio/pcma", rate: 8000 };
      case "pcm16":
      default:
        return { type: "audio/pcm", rate: 24000 };
    }
  }

  private routeEvent(parsed: RealtimeEvent): void {
    if (isTranscriptDelta(parsed)) {
      if (this.timing.firstTranscriptDelta === undefined) {
        this.timing.firstTranscriptDelta = Date.now();
      }
      this.transcriptAccumulator += parsed.delta;
      this.callbacks.onTranscript?.(this.transcriptAccumulator, false);
      if (this._state === "connected") this.setState("speaking");
      return;
    }

    if (isTranscriptDone(parsed)) {
      this.transcriptAccumulator = parsed.transcript;
      this.callbacks.onTranscript?.(parsed.transcript, true);
      return;
    }

    if (isAudioDelta(parsed)) {
      if (this.timing.firstAudioDelta === undefined) {
        this.timing.firstAudioDelta = Date.now();
      }
      this.playAudio(parsed.delta);
      this.callbacks.onAudio?.(parsed.delta);
      this.callbacks.onAudioDelta?.(parsed.delta);
      if (this._state === "connected") this.setState("speaking");
      return;
    }

    if (isAudioDone(parsed)) {
      return;
    }

    if (isSpeechStarted(parsed)) {
      this.userTranscripts = [];
      this.setState("speaking");
      return;
    }

    if (isSpeechStopped(parsed)) {
      if (this._state === "speaking") this.setState("connected");
      return;
    }

    if (isResponseCreated(parsed)) {
      this.timing.responseCreated = Date.now();
      this.transcriptAccumulator = "";
      return;
    }

    if (isResponseDone(parsed)) {
      this.timing.responseDone = Date.now();
      if (this._state === "speaking") this.setState("connected");
      return;
    }

    if (isUserTranscript(parsed)) {
      if (this.timing.firstUserTranscript === undefined) {
        this.timing.firstUserTranscript = Date.now();
      }
      this.userTranscripts.push(parsed.transcript);
      this.callbacks.onUserTranscript?.(parsed.transcript);
      return;
    }

    if (isFunctionCallDone(parsed)) {
      this.timing.toolCallReceived = Date.now();
      this.callbacks.onFunctionCall?.(parsed);
      return;
    }

    if (isErrorEvent(parsed)) {
      this.setState("error");
      this.callbacks.onError?.(parsed.error.message, parsed.error.code);
    }
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
      const input = e.inputBuffer.getChannelData(0);
      const pcm = this.floatTo16BitPcm(input);
      const base64 = this.arrayBufferToBase64(pcm.buffer);
      this.sendAudio(base64);
    };
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
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.nextPlayTime = 0;
    this.transcriptAccumulator = "";
  }

  markToolExecuted(): void {
    this.timing.toolExecuted = Date.now();
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    if (this.nextPlayTime < this.audioContext.currentTime) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
    return this.audioContext;
  }

  private playAudio(base64Audio: string): void {
    try {
      const context = this.ensureAudioContext();
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const sampleCount = Math.floor(bytes.byteLength / 2);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
      const buffer = context.createBuffer(1, sampleCount, 24000);
      const channel = buffer.getChannelData(0);

      for (let i = 0; i < sampleCount; i++) {
        channel[i] = pcm16[i] / 0x8000;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error.message : "Audio playback failed",
        "AUDIO_PLAYBACK_FAILED",
      );
    }
  }

  private floatTo16BitPcm(float32Array: Float32Array): Int16Array {
    const pcm = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  getTranscriptHistory(): string[] {
    return [...this.userTranscripts];
  }

  resetTiming(): void {
    this.timing = this.freshTiming();
  }
}
