import { useState, useEffect } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@/components";
import { KrishnaChakra } from "./KrishnaChakra";
import { fetchSTT } from "@/lib";
import { floatArrayToWav } from "@/lib/utils";
import { useApp } from "@/contexts";
import { useKrishna } from "@/hooks";
import { isKrishnaSpeaking } from "@/lib/krishna-mutex";
import { getRepo } from "@/lib/repo-selector";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { verifyVoice, getVoiceStatus, isVoiceIdEnabled } from "@/lib/voice-client";
import type { VoiceVerifyResult } from "@/lib/voice-client";

export const KrishnaVAD = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceVerifyResult | null>(null);
  const { selectedSttProvider, allSttProviders, selectedAIProvider } = useApp();
  const krishna = useKrishna();

  const brainHandlesAI = getRepo().mode === "remote";
  const missingAI = !selectedAIProvider.provider && !brainHandlesAI;
  const missingSTT = !selectedSttProvider.provider;
  const missingProviders = missingAI || missingSTT;

  const vad = useMicVAD({
    positiveSpeechThreshold: 0.4,
    negativeSpeechThreshold: 0.2,
    userSpeakingThreshold: 0.4,
    startOnLoad: !missingProviders,
    baseAssetPath: "/",
    // ONNX loads its WASM runtime by dynamically import()-ing ort-wasm-*.mjs. Pointing
    // this at a local path routes that import through Vite's dev transform, which 500s
    // on the prebuilt module ("Failed to fetch dynamically imported module ...?import").
    // The CDN serves the .mjs raw, so it loads in both dev and prod. The model files
    // (.onnx) are still bundled locally via baseAssetPath. Requires cdn.jsdelivr.net in
    // the prod CSP script-src (cross-origin module import) + connect-src (wasm fetch).
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/",
    // Disable ONNX threading on vad's own ort instance — threaded WASM needs
    // SharedArrayBuffer, which Tauri's production WebView doesn't expose. Done via
    // the ortConfig hook (not a direct onnxruntime-web import) so Vite never has to
    // pre-bundle the 26MB package — a direct import stalls the dev server on startup.
    ortConfig: (ort) => {
      ort.env.wasm.numThreads = 1;
    },
    // Barge-in: if the user starts talking while Krishna is speaking, stop him
    // immediately. Reuses the wired "plan-abort" handler (stops TTS + aborts the
    // in-flight AI stream). onSpeechEnd then transcribes the interrupting utterance
    // as the next command, since plan-abort has cleared the speaking flag by then.
    onSpeechStart: () => {
      if (isKrishnaSpeaking()) {
        emit("plan-abort");
      }
    },
    onSpeechEnd: async (audio) => {
      if (isKrishnaSpeaking()) return;

      try {
        const audioBlob = floatArrayToWav(audio, 16000, "wav");
        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig) {
          return;
        }

        setIsTranscribing(true);

        // Run STT and (optionally) voice-ID verification in parallel.
        // When voice ID is disabled, skip verify entirely.
        const voiceIdEnabled = isVoiceIdEnabled();
        const [transcription, voiceResult] = await Promise.all([
          fetchSTT({
            provider: providerConfig,
            selectedProvider: selectedSttProvider,
            audio: audioBlob,
          }),
          voiceIdEnabled
            ? verifyVoice(audioBlob).catch((err) => {
                console.error("[voice-id] Verify failed (fail-open):", err);
                return null as any;
              })
            : Promise.resolve(null),
        ]);

        if (voiceResult) setVoiceStatus(voiceResult);

        if (transcription) {
          await krishna.processCommand(transcription, {
            voiceVerifyResult: voiceResult ?? undefined,
          });
        }
      } catch (error) {
        console.error("Krishna VAD transcription failed:", error);
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  // Fetch initial voice-ID enrollment status on mount
  useEffect(() => {
    getVoiceStatus()
      .then((s) => {
        if (s) setVoiceStatus({ enrolled: s.enrolled, match: true, score: 1, threshold: s.threshold });
      })
      .catch(() => {});
  }, []);

  // `startOnLoad` is evaluated once when the VAD effect first runs, but providers
  // load asynchronously from localStorage — so on a fresh load the VAD often
  // initializes before providers are ready and never auto-starts. This backstop
  // starts it as soon as providers are present, the engine is ready, and the
  // user hasn't manually muted. No-ops once it's already listening.
  useEffect(() => {
    if (!missingProviders && !muted && !vad.loading && !vad.errored && !vad.listening) {
      vad.start();
    }
  }, [missingProviders, muted, vad.loading, vad.errored, vad.listening]);

  // Log the actual VAD error string so we can diagnose failures in production
  useEffect(() => {
    if (vad.errored) console.error("[KrishnaVAD] VAD error:", vad.errored);
  }, [vad.errored]);

  // Wire VAD userSpeaking to presence overlay
  useEffect(() => {
    if (vad.userSpeaking) {
      invoke("show_presence");
      emit("vad-user-speaking", { speaking: true });
    } else {
      emit("vad-user-speaking", { speaking: false });
    }
  }, [vad.userSpeaking]);

  const handleMuteToggle = () => {
    if (muted) {
      vad.start();
      setMuted(false);
    } else {
      vad.pause();
      setMuted(true);
    }
  };

  // The Sudarshan Chakra is the primary voice indicator. It spins/pulses by state;
  // a red alert icon shows only when voice genuinely can't run (no provider / mic error).
  const getIcon = () => {
    if (vad.errored) return <AlertCircleIcon className="h-4 w-4 text-red-500" />;
    if (vad.loading) return <KrishnaChakra state="processing" size={18} />;
    if (muted) return <KrishnaChakra state="idle" size={18} />;
    if (isTranscribing || krishna.status === "thinking")
      return <KrishnaChakra state="processing" size={18} />;
    if (krishna.status === "speaking")
      return <KrishnaChakra state="speaking" size={18} />;
    if (vad.userSpeaking || vad.listening)
      return <KrishnaChakra state="listening" size={18} />;
    return <KrishnaChakra state="idle" size={18} />;
  };

  const getTitle = () => {
    if (missingSTT && missingAI && !brainHandlesAI) return "No speech or AI provider — open Settings";
    if (missingSTT) return "No speech provider — open Settings › Speech";
    if (missingAI && !brainHandlesAI) return "No AI provider — open Settings › Brain";
    if (vad.errored) return typeof vad.errored === "string" ? `Mic error: ${vad.errored}` : "Mic error — reload app to retry";
    if (vad.loading) return "Loading voice detection…";
    if (muted) return "Mic muted — click to unmute";
    if (isTranscribing) return "Transcribing...";
    if (krishna.status === "thinking") return "Krishna is thinking...";
    if (krishna.status === "speaking") return "Krishna is speaking";
    if (vad.userSpeaking) return "Listening...";
    if (vad.listening) return "Mic active — click to mute";
    return "Mic paused — click to start";
  };

  return (
    <div className="relative inline-flex">
    <Button
      size="icon"
      title={getTitle()}
      onClick={missingProviders ? undefined : handleMuteToggle}
      className={
        missingProviders
          ? "bg-red-50 hover:bg-red-100"
          : vad.errored
          ? "bg-red-50 hover:bg-red-100"
          : muted
          ? "bg-red-50 hover:bg-red-100"
          : krishna.status === "speaking"
          ? "bg-green-50 hover:bg-green-100"
          : vad.userSpeaking
          ? "bg-green-50 hover:bg-green-100"
          : vad.listening
          ? "bg-green-50 hover:bg-green-100"
          : "bg-red-50 hover:bg-red-100"
      }
    >
      {getIcon()}
    </Button>
    {voiceStatus && (
      <span
        className={`absolute top-0 right-0 w-2 h-2 rounded-full border border-white dark:border-zinc-900 ${
          voiceStatus.enrolled && !voiceStatus.match
            ? "bg-amber-400"   // enrolled but unverified
            : voiceStatus.enrolled
            ? "bg-green-500"   // enrolled and verified
            : "bg-zinc-400"    // not enrolled
        }`}
        title={
          voiceStatus.enrolled && !voiceStatus.match
            ? "Unverified speaker"
            : voiceStatus.enrolled
            ? "Speaker verified"
            : "Voice ID not enrolled"
        }
      />
    )}
    </div>
  );
};
