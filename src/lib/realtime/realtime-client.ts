import type {
  RealtimeSessionState,
  RealtimeConfig,
  RealtimeEvent,
  RealtimeTimingMarks,
} from "./realtime-types";
import { DEFAULT_REALTIME_CONFIG } from "./realtime-types";
import {
  parseRealtimeEvent,
  isTranscriptDelta,
  isTranscriptDone,
  isAudioDelta,
  isAudioDone,
  isErrorEvent,
  isUserTranscriptCompleted,
  extractTranscriptText,
  extractAudioDelta,
  isValidStateTransition,
} from "./realtime-events";

export interface RealtimeClientCallbacks {
  onStateChange?: (state: RealtimeSessionState) => void;
  onError?: (message: string, code?: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onUserTranscript?: (text: string) => void;
  onAudioDelta?: (base64Audio: string, isFinal: boolean) => void;
  onEvent?: (event: RealtimeEvent) => void;
}

const PCM_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

export class RealtimeClient {
  private _state: RealtimeSessionState = "idle";
  private _config: RealtimeConfig;
  private _ws: WebSocket | null = null;
  private _audioContext: AudioContext | null = null;
  private _scriptProcessor: ScriptProcessorNode | null = null;
  private _micSource: MediaStreamAudioSourceNode | null = null;
  private _micStream: MediaStream | null = null;
  private _nextPlayTime = 0;
  private _transcriptAccumulator = "";
  private _callbacks: RealtimeClientCallbacks = {};
  private _timing: RealtimeTimingMarks = {
    connectStart: 0,
    connectedAt: undefined,
    firstTranscriptDelta: undefined,
    firstAudioDelta: undefined,
    firstUserTranscript: undefined,
    responseCreated: undefined,
    responseDone: undefined,
    disconnectStart: undefined,
  };

  constructor(config?: Partial<RealtimeConfig>) {
    this._config = { ...DEFAULT_REALTIME_CONFIG, ...config };
  }

  get state(): RealtimeSessionState {
    return this._state;
  }

  get timing(): RealtimeTimingMarks {
    return { ...this._timing };
  }

  get config(): RealtimeConfig {
    return { ...this._config };
  }

  setCallbacks(cbs: RealtimeClientCallbacks): void {
    this._callbacks = cbs;
  }

  private _setState(state: RealtimeSessionState): void {
    if (!isValidStateTransition(this._state, state)) {
      console.warn(
        `[Realtime] Invalid state transition: ${this._state} -> ${state}`,
      );
      return;
    }
    this._state = state;
    this._callbacks.onStateChange?.(state);
  }

  private _emitError(message: string, code?: string): void {
    this._setState("error");
    this._callbacks.onError?.(message, code);
  }

  async connect(apiKey: string): Promise<void> {
    if (this._state !== "idle") {
      throw new Error(
        `Cannot connect: current state is "${this._state}". Disconnect first.`,
      );
    }

    this._timing = {
      connectStart: performance.now(),
      connectedAt: undefined,
      firstTranscriptDelta: undefined,
      firstAudioDelta: undefined,
      firstUserTranscript: undefined,
      responseCreated: undefined,
      responseDone: undefined,
      disconnectStart: undefined,
    };

    this._setState("connecting");

    try {
      await this._connectWebSocket(apiKey);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to connect session";
      this._emitError(msg, "SESSION_CONNECT_FAILED");
      throw error;
    }
  }

  // Resolves once the socket is OPEN and the session update has been sent, so
  // callers can safely start recording. Rejects if the socket fails to open.
  private _connectWebSocket(apiKey: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this._config.model)}`;

      try {
        this._ws = new WebSocket(wsUrl, [
          "realtime",
          `openai-insecure-api-key.${apiKey}`,
        ]);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("WebSocket construction failed"),
        );
        return;
      }

      let opened = false;

      this._ws.onopen = () => {
        opened = true;
        this._sendSessionUpdate();
        resolve();
      };

      this._ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          this._handleMessage(event.data);
        }
      };

      this._ws.onerror = () => {
        if (!opened) {
          reject(new Error("WebSocket connection error"));
          return;
        }
        this._emitError("WebSocket connection error", "WS_ERROR");
      };

      this._ws.onclose = (event: CloseEvent) => {
        const reason = event.reason || `code ${event.code}`;
        if (!opened) {
          reject(new Error(`Connection closed before ready: ${reason}`));
          return;
        }
        if (this._state === "connected" || this._state === "speaking") {
          this._setState("idle");
          this._callbacks.onError?.(`Connection closed: ${reason}`, "WS_CLOSE");
        } else if (this._state === "disconnecting") {
          this._setState("idle");
        }
      };
    });
  }

  // GA Realtime API expects the audio format as an object, not a bare string.
  private _toGaAudioFormat(
    format: RealtimeConfig["inputAudioFormat"],
  ): { type: string; rate: number } {
    switch (format) {
      case "g711_ulaw":
        return { type: "audio/pcmu", rate: 8000 };
      case "g711_alaw":
        return { type: "audio/pcma", rate: 8000 };
      case "pcm16":
      default:
        return { type: "audio/pcm", rate: PCM_SAMPLE_RATE };
    }
  }

  private _sendSessionUpdate(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

    this._timing.connectedAt = performance.now();
    this._setState("connected");

    // GA session shape (gpt-realtime): requires `type`, uses `output_modalities`,
    // and nests audio config under `audio.input` / `audio.output`.
    const update = {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: this._config.instructions,
        audio: {
          input: {
            format: this._toGaAudioFormat(this._config.inputAudioFormat),
            transcription: this._config.inputAudioTranscription,
            turn_detection: this._config.turnDetection,
          },
          output: {
            format: this._toGaAudioFormat(this._config.outputAudioFormat),
            voice: this._config.voice,
          },
        },
        max_output_tokens: this._config.maxResponseOutputTokens,
      },
    };

    this._ws.send(JSON.stringify(update));
  }

  private _handleMessage(data: string): void {
    const event = parseRealtimeEvent(data);
    if (!event) return;

    this._callbacks.onEvent?.(event);

    switch (event.type) {
      case "response.created":
        this._timing.responseCreated = performance.now();
        this._transcriptAccumulator = "";
        if (this._state !== "error") {
          this._setState("speaking");
        }
        break;

      case "response.done":
        this._timing.responseDone = performance.now();
        if (this._state !== "error") {
          this._setState("connected");
        }
        break;

      case "response.audio_transcript.delta": {
        if (this._timing.firstTranscriptDelta === undefined) {
          this._timing.firstTranscriptDelta = performance.now();
        }
        if (isTranscriptDelta(event)) {
          this._transcriptAccumulator += event.delta;
          this._callbacks.onTranscript?.(this._transcriptAccumulator, false);
        }
        break;
      }

      case "response.output_audio_transcript.delta": {
        if (this._timing.firstTranscriptDelta === undefined) {
          this._timing.firstTranscriptDelta = performance.now();
        }
        if (isTranscriptDelta(event)) {
          this._transcriptAccumulator += event.delta;
          this._callbacks.onTranscript?.(this._transcriptAccumulator, false);
        }
        break;
      }

      case "response.audio_transcript.done": {
        if (isTranscriptDone(event)) {
          this._transcriptAccumulator = event.transcript;
          this._callbacks.onTranscript?.(event.transcript, true);
        }
        break;
      }

      case "response.output_audio_transcript.done": {
        if (isTranscriptDone(event)) {
          this._transcriptAccumulator = event.transcript;
          this._callbacks.onTranscript?.(event.transcript, true);
        }
        break;
      }

      case "response.audio.delta": {
        if (this._timing.firstAudioDelta === undefined) {
          this._timing.firstAudioDelta = performance.now();
        }
        if (isAudioDelta(event)) {
          this._playAudio(event.delta);
          this._callbacks.onAudioDelta?.(event.delta, false);
        }
        break;
      }

      case "response.audio.done": {
        if (isAudioDone(event) && event.delta) {
          this._playAudio(event.delta);
          this._callbacks.onAudioDelta?.(event.delta, true);
        }
        break;
      }

      case "response.output_audio.delta": {
        if (this._timing.firstAudioDelta === undefined) {
          this._timing.firstAudioDelta = performance.now();
        }
        if (isAudioDelta(event)) {
          this._playAudio(event.delta);
          this._callbacks.onAudioDelta?.(event.delta, false);
        }
        break;
      }

      case "response.output_audio.done": {
        if (isAudioDone(event) && event.delta) {
          this._playAudio(event.delta);
          this._callbacks.onAudioDelta?.(event.delta, true);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        if (this._timing.firstUserTranscript === undefined) {
          this._timing.firstUserTranscript = performance.now();
        }
        if (isUserTranscriptCompleted(event)) {
          this._callbacks.onUserTranscript?.(event.transcript);
        }
        break;
      }

      case "input_audio_buffer.speech_started":
        break;

      case "input_audio_buffer.speech_stopped":
        break;

      case "error": {
        if (isErrorEvent(event)) {
          this._emitError(
            event.error.message || "Unknown Realtime error",
            event.error.code,
          );
        }
        break;
      }
    }
  }

  private _ensureAudioContext(): AudioContext {
    if (!this._audioContext) {
      this._audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    }
    if (this._nextPlayTime < this._audioContext.currentTime) {
      this._nextPlayTime = this._audioContext.currentTime;
    }
    return this._audioContext;
  }

  private _playAudio(base64Audio: string): void {
    try {
      const audioContext = this._ensureAudioContext();
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const sampleCount = Math.floor(bytes.byteLength / 2);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
      const buffer = audioContext.createBuffer(1, sampleCount, PCM_SAMPLE_RATE);
      const channel = buffer.getChannelData(0);

      for (let i = 0; i < sampleCount; i++) {
        channel[i] = pcm16[i] / 0x8000;
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(this._nextPlayTime);
      this._nextPlayTime += buffer.duration;
    } catch (error) {
      this._callbacks.onError?.(
        error instanceof Error ? error.message : "Audio playback failed",
        "AUDIO_PLAYBACK_FAILED",
      );
    }
  }

  async startRecording(stream: MediaStream): Promise<void> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot start recording: WebSocket not connected");
    }

    this._micStream = stream;

    try {
      this._audioContext = this._ensureAudioContext();
      this._micSource = this._audioContext.createMediaStreamSource(stream);

      this._scriptProcessor = this._audioContext.createScriptProcessor(
        SCRIPT_PROCESSOR_BUFFER_SIZE,
        1,
        1,
      );

      this._micSource.connect(this._scriptProcessor);
      this._scriptProcessor.connect(this._audioContext.destination);

      this._scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (
          !this._ws ||
          this._ws.readyState !== WebSocket.OPEN
        )
          return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const clamped = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        }

        const bytes = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        this._ws.send(
          JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }),
        );
      };
    } catch (error) {
      this._emitError(
        error instanceof Error
          ? `Audio capture setup failed: ${error.message}`
          : "Audio capture setup failed",
        "AUDIO_SETUP_FAILED",
      );
      throw error;
    }
  }

  stopRecording(): void {
    if (this._scriptProcessor) {
      this._scriptProcessor.onaudioprocess = null;
      this._scriptProcessor.disconnect();
      this._scriptProcessor = null;
    }

    if (this._micSource) {
      this._micSource.disconnect();
      this._micSource = null;
    }

    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }

    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
  }

  disconnect(): void {
    if (this._state === "idle" && !this._ws && !this._audioContext) {
      return;
    }

    this._timing.disconnectStart = performance.now();
    if (this._state !== "idle") {
      this._setState("disconnecting");
    }

    this.stopRecording();

    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
    }

    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onerror = null;
      this._ws.onclose = null;

      if (
        this._ws.readyState === WebSocket.OPEN ||
        this._ws.readyState === WebSocket.CONNECTING
      ) {
        this._ws.close(1000, "Client disconnect");
      }
      this._ws = null;
    }

    this._nextPlayTime = 0;
    this._transcriptAccumulator = "";
    this._callbacks = {};

    if (this._state !== "error") {
      this._setState("idle");
    }
  }

  cancelResponse(): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "response.cancel" }));
    }
  }
}
