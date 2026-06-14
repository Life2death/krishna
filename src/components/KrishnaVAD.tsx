import { useState, useEffect } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import {
  MicIcon,
  MicOffIcon,
  LoaderCircleIcon,
  BotIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components";
import { fetchSTT } from "@/lib";
import { floatArrayToWav } from "@/lib/utils";
import { useApp } from "@/contexts";
import { useKrishna } from "@/hooks";
import { isKrishnaSpeaking } from "@/lib/krishna-mutex";

export const KrishnaVAD = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [muted, setMuted] = useState(false);
  const { selectedSttProvider, allSttProviders, selectedAIProvider } = useApp();
  const krishna = useKrishna();

  const missingAI = !selectedAIProvider.provider;
  const missingSTT = !selectedSttProvider.provider;
  const missingProviders = missingAI || missingSTT;

  const vad = useMicVAD({
    positiveSpeechThreshold: 0.4,
    negativeSpeechThreshold: 0.2,
    userSpeakingThreshold: 0.4,
    startOnLoad: !missingProviders,
    baseAssetPath: "/",
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/",
    onSpeechEnd: async (audio) => {
      if (isKrishnaSpeaking()) return;

      try {
        const audioBlob = floatArrayToWav(audio, 16000, "wav");
        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig) return;

        setIsTranscribing(true);

        const transcription = await fetchSTT({
          provider: providerConfig,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        });

        if (transcription) {
          await krishna.processCommand(transcription);
        }
      } catch (error) {
        console.error("Krishna VAD transcription failed:", error);
      } finally {
        setIsTranscribing(false);
      }
    },
  });

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

  const handleMuteToggle = () => {
    if (muted) {
      vad.start();
      setMuted(false);
    } else {
      vad.pause();
      setMuted(true);
    }
  };

  // Green = actively listening/working. Red = can't work / inactive.
  // Spinner = transient (loading model, transcribing, thinking).
  const getIcon = () => {
    if (missingProviders) return <AlertCircleIcon className="h-4 w-4 text-red-500" />;
    if (vad.errored) return <AlertCircleIcon className="h-4 w-4 text-red-500" />;
    if (vad.loading) return <LoaderCircleIcon className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (muted) return <MicOffIcon className="h-4 w-4 text-red-500" />;
    if (isTranscribing || krishna.status === "thinking")
      return <LoaderCircleIcon className="h-4 w-4 animate-spin text-primary" />;
    if (krishna.status === "speaking")
      return <BotIcon className="h-4 w-4 text-green-500 animate-pulse" />;
    if (vad.userSpeaking)
      return <MicIcon className="h-4 w-4 text-green-600 animate-pulse" />;
    if (vad.listening)
      return <MicIcon className="h-4 w-4 text-green-500 animate-pulse" />;
    return <MicOffIcon className="h-4 w-4 text-red-500" />;
  };

  const getTitle = () => {
    if (missingSTT && missingAI) return "No speech or AI provider — open Settings";
    if (missingSTT) return "No speech provider — open Settings › Speech";
    if (missingAI) return "No AI provider — open Settings › Brain";
    if (vad.errored) return "Mic error — reload app to retry";
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
  );
};
