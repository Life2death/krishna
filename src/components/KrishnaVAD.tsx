import { useState } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import {
  MicIcon,
  MicOffIcon,
  LoaderCircleIcon,
  BotIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components";
import { fetchSTT } from "@/lib";
import { floatArrayToWav } from "@/lib/utils";
import { useApp } from "@/contexts";
import { shouldUseNaukriLeloAPI } from "@/lib/functions/naukri-lelo.api";
import { useKrishna } from "@/hooks";
import { isKrishnaSpeaking } from "@/lib/krishna-mutex";

export const KrishnaVAD = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { selectedSttProvider, allSttProviders, selectedAIProvider } = useApp();
  const krishna = useKrishna();

  const missingSTT = !selectedSttProvider.provider;
  const missingAI = !selectedAIProvider.provider;
  const missingProviders = missingSTT || missingAI;

  const vad = useMicVAD({
    positiveSpeechThreshold: 0.4,
    negativeSpeechThreshold: 0.2,
    minSpeechFrames: 2,
    userSpeakingThreshold: 0.4,
    startOnLoad: !missingProviders,
    baseAssetPath: "/",
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/",
    onSpeechEnd: async (audio) => {
      if (isKrishnaSpeaking()) return;

      try {
        const audioBlob = floatArrayToWav(audio, 16000, "wav");
        const useNaukriLeloAPI = await shouldUseNaukriLeloAPI();

        if (!selectedSttProvider.provider && !useNaukriLeloAPI) return;

        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig && !useNaukriLeloAPI) return;

        setIsTranscribing(true);

        const transcription = await fetchSTT({
          provider: useNaukriLeloAPI ? undefined : providerConfig,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        });

        if (transcription) {
          setPendingText(transcription);
          try {
            await krishna.processCommand(transcription);
          } finally {
            setPendingText(null);
          }
        }
      } catch (error) {
        console.error("Krishna VAD transcription failed:", error);
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  const getIcon = () => {
    if (missingProviders) return <AlertCircleIcon className="h-4 w-4 text-orange-500" />;
    if (isTranscribing || krishna.status === "thinking")
      return <LoaderCircleIcon className="h-4 w-4 animate-spin text-primary" />;
    if (krishna.status === "speaking")
      return <BotIcon className="h-4 w-4 text-green-500 animate-pulse" />;
    if (vad.userSpeaking)
      return <LoaderCircleIcon className="h-4 w-4 animate-spin text-orange-400" />;
    if (vad.listening)
      return <MicIcon className="h-4 w-4 text-green-500 animate-pulse" />;
    return <MicOffIcon className="h-4 w-4 text-muted-foreground" />;
  };

  const getTitle = () => {
    if (missingSTT) return "No speech provider — open Settings › Speech";
    if (missingAI) return "No AI provider — open Settings › Brain";
    if (isTranscribing) return "Transcribing...";
    if (krishna.status === "thinking") return "Krishna is thinking...";
    if (krishna.status === "speaking") return "Krishna is speaking";
    if (vad.userSpeaking) return "Listening...";
    if (vad.listening) return "Listening — click to see conversations";
    return "Mic paused";
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          title={getTitle()}
          className={
            missingProviders
              ? "bg-orange-50 hover:bg-orange-100"
              : vad.userSpeaking
              ? "bg-orange-50 hover:bg-orange-100"
              : vad.listening
              ? "bg-green-50 hover:bg-green-100"
              : ""
          }
        >
          {getIcon()}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="bottom" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Conversations</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs text-muted-foreground"
            onClick={() => {
              if (vad.listening) vad.pause(); else vad.start();
            }}
          >
            {vad.listening ? "Pause mic" : "Resume mic"}
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y">
          {/* Live pending item */}
          {pendingText && (
            <div className="px-3 py-2 space-y-1 bg-muted/40">
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-primary mt-0.5">You</span>
                <p className="text-xs text-foreground flex-1">{pendingText}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-600">Krishna</span>
                <LoaderCircleIcon className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">thinking…</span>
              </div>
            </div>
          )}

          {/* Last error */}
          {krishna.lastError && !pendingText && (
            <div className="px-3 py-2 flex items-start gap-2 bg-red-50 dark:bg-red-950/20">
              <AlertCircleIcon className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400 flex-1">{krishna.lastError}</p>
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => krishna.clearLastError()}
              >
                ✕
              </button>
            </div>
          )}

          {!pendingText && !krishna.lastError && krishna.conversationHistory.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet. Just speak to start.
            </div>
          ) : (
            krishna.conversationHistory.map((turn) => (
              <div key={turn.id} className="px-3 py-2 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-primary mt-0.5">You</span>
                  <p className="text-xs text-foreground flex-1">{turn.userText}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(turn.timestamp)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-green-600 mt-0.5">Krishna</span>
                  <p className="text-xs text-muted-foreground flex-1">{turn.assistantText}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
