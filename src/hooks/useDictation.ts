import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/contexts";
import { fetchSTTWithRetryDefault } from "@/lib/fetch-stt-with-retry";

// Matches AudioRecorder's cap on classic voice-input recordings.
const MAX_DICTATION_DURATION_MS = 3 * 60 * 1000;

/**
 * Dictation never shows or focuses Krishna's window, so there's no on-screen way to
 * tell whether a press just started or stopped a recording. Two independent, passive
 * cues cover that gap without ever stealing focus: a short tone (so you know the
 * state changed without looking at anything) and the tray icon's tooltip (so you can
 * hover it any time to check "am I currently recording?" before pressing again).
 */
type DictationTrayStatus = "recording" | "transcribing" | "idle";

const setTrayStatus = (status: DictationTrayStatus) => {
  invoke("set_dictation_tray_status", { status }).catch(() => {
    // Best-effort indicator only — never block dictation on it.
  });
};

let sharedAudioContext: AudioContext | null = null;

/** Short beep via Web Audio — no asset files, works regardless of what app has focus. */
const playTone = (frequencyHz: number, durationMs: number) => {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    sharedAudioContext ??= new AudioCtx();
    const ctx = sharedAudioContext;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequencyHz;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio cue is a nicety, not a requirement — never let it throw into callers.
  }
};

// Rising blip = "started listening". Falling blip = "stopped, working on it".
// Low buzz = "something went wrong, nothing was typed".
const playStartTone = () => playTone(880, 110);
const playStopTone = () => playTone(523, 110);
const playErrorTone = () => playTone(180, 220);

/**
 * Headless, invisible OS-wide dictation: global hotkey -> record mic (no UI, no
 * window show/focus) -> cloud STT (reusing the same provider pipeline as
 * AudioRecorder.tsx) -> type the transcription into whichever window currently
 * has OS focus via the `dictation_type_text` Tauri command.
 *
 * Deliberately independent of `useGlobalShortcuts`' callback-registry: dictation
 * has its own dedicated event, `start-dictation-recording` (emitted by
 * `handle_dictation_shortcut` in src-tauri/src/shortcuts.rs), specifically because
 * it must NOT show or focus Krishna's window the way the existing `audio_recording`
 * action does — the whole point is that the externally-focused app (browser,
 * Word, Slack, etc.) stays focused so the transcription types into IT.
 *
 * Gated server-side by the dedicated `DictationState` Rust flag (toggled via the
 * "Dictation" switch in Settings, NOT the broad Computer Control toggle) — the
 * `dictation_type_text` command refuses to type anything unless that flag is on,
 * so this hook checks `customizable.dictation.enabled` up front purely to skip
 * wasted mic access / STT calls, not as the real security boundary.
 */
export const useDictation = () => {
  const { selectedSttProvider, allSttProviders, selectedAudioDevices, customizable } =
    useApp();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTranscribingRef = useRef(false);
  const isStartingRef = useRef(false);

  // Latest selection snapshots, read inside the stable event handler below
  // without needing to re-subscribe the Tauri listener on every render.
  const sttProviderRef = useRef(selectedSttProvider);
  const allSttProvidersRef = useRef(allSttProviders);
  const audioDevicesRef = useRef(selectedAudioDevices);
  const dictationEnabledRef = useRef(customizable.dictation.enabled);
  sttProviderRef.current = selectedSttProvider;
  allSttProvidersRef.current = allSttProviders;
  audioDevicesRef.current = selectedAudioDevices;
  dictationEnabledRef.current = customizable.dictation.enabled;

  const cleanup = useCallback(() => {
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore — recorder may already be inactive.
      }
    }
    mediaRecorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      return;
    }

    const mimeType = recorder.mimeType;
    const chunks = [...audioChunksRef.current];
    cleanup();
    setIsRecording(false);
    playStopTone();

    const totalBytes = chunks.reduce((sum, c) => sum + c.size, 0);
    console.warn(
      `[dictation] Stopped. Captured ${chunks.length} chunk(s), ${totalBytes} bytes total.`
    );

    if (chunks.length === 0) {
      console.warn("[dictation] No audio chunks captured — nothing to transcribe.");
      setTrayStatus("idle");
      return;
    }

    isTranscribingRef.current = true;
    setIsTranscribing(true);
    setTrayStatus("transcribing");
    try {
      const audioBlob = new Blob(chunks, { type: mimeType });
      const provider = allSttProvidersRef.current.find(
        (p) => p.id === sttProviderRef.current.provider
      );

      if (!provider) {
        console.warn(
          "[dictation] No speech-to-text provider configured — skipping transcription."
        );
        playErrorTone();
        return;
      }

      console.warn(`[dictation] Sending ${audioBlob.size} bytes to STT provider:`, provider.id);
      const text = await fetchSTTWithRetryDefault({
        provider,
        selectedProvider: sttProviderRef.current,
        audio: audioBlob,
      });
      console.warn("[dictation] STT raw result:", JSON.stringify(text));

      const trimmed = text?.trim();
      if (trimmed) {
        // Types into whatever window currently has OS focus — never Krishna's own
        // window, which is never shown/focused by the dictation hotkey.
        console.warn(`[dictation] Invoking dictation_type_text with ${trimmed.length} chars...`);
        const result = await invoke("dictation_type_text", { text: trimmed });
        console.warn("[dictation] dictation_type_text returned:", result);
      } else {
        console.warn(
          "[dictation] STT returned an empty transcript — nothing to type. This usually means the recorded audio was silent (wrong mic captured) or too quiet."
        );
        playErrorTone();
      }
    } catch (error) {
      console.error("[dictation] Transcription or typing failed:", error);
      playErrorTone();
    } finally {
      isTranscribingRef.current = false;
      setIsTranscribing(false);
      setTrayStatus("idle");
    }
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      const deviceId = audioDevicesRef.current?.input?.id;
      const audioConstraints: MediaTrackConstraints =
        deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      } catch (constraintError) {
        // The selected mic's id comes from Rust's WASAPI/CoreAudio/PulseAudio
        // enumeration (src-tauri/src/speaker/*), a different id space than the
        // WebView's own MediaDeviceInfo.deviceId — an `exact` match against it
        // can never succeed and always throws OverconstrainedError. Fall back
        // to the system default mic rather than silently failing to record.
        if (
          Object.keys(audioConstraints).length === 0 ||
          !(constraintError instanceof DOMException) ||
          constraintError.name !== "OverconstrainedError"
        ) {
          throw constraintError;
        }
        console.warn(
          "[dictation] Selected microphone unavailable to the WebView, falling back to system default:",
          constraintError
        );
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      console.warn(
        "[dictation] Recording started using device:",
        stream.getAudioTracks()[0]?.label || "(label unavailable)"
      );

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      playStartTone();
      setTrayStatus("recording");

      maxDurationTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopAndTranscribe();
        }
      }, MAX_DICTATION_DURATION_MS);
    } catch (error) {
      console.error("[dictation] Failed to start recording:", error);
      playErrorTone();
      setTrayStatus("idle");
      cleanup();
      setIsRecording(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [cleanup, stopAndTranscribe]);

  // Toggle: first hotkey press starts recording, second press stops + transcribes
  // + types. Referentially stable (deps never change identity), so the listener
  // effect below only subscribes once.
  const handleDictationTrigger = useCallback(() => {
    if (!dictationEnabledRef.current) {
      console.warn(
        "[dictation] Hotkey pressed but Dictation is disabled — enable it in Settings."
      );
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      stopAndTranscribe();
    } else if (!isTranscribingRef.current && !isStartingRef.current) {
      startRecording();
    }
  }, [startRecording, stopAndTranscribe]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("start-dictation-recording", () => {
      handleDictationTrigger();
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      cleanup();
      setTrayStatus("idle");
    };
  }, [handleDictationTrigger, cleanup]);

  // Exposes the same toggle the global hotkey uses, so an on-screen button can
  // trigger it identically (start on first click, stop+transcribe+type on the
  // second) instead of duplicating the start/stop logic.
  return { isRecording, isTranscribing, triggerDictation: handleDictationTrigger };
};
