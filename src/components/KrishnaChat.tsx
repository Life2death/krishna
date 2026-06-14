import { useState, useEffect } from "react";
import {
  MessageSquareIcon,
  LoaderCircleIcon,
  AlertCircleIcon,
  Volume2Icon,
  ChevronDownIcon,
  ZapIcon,
} from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components";
import { useKrishna } from "@/hooks";

interface VoiceOption {
  name: string;
  lang: string;
  localService: boolean;
}

export const KrishnaChat = () => {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const krishna = useKrishna();

  const isElevenLabs = krishna.ttsProvider === "elevenlabs";

  useEffect(() => {
    if (isElevenLabs) return; // browser voices not needed when using EL
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const en = all
        .filter((v) => v.lang.startsWith("en"))
        .map((v) => ({ name: v.name, lang: v.lang, localService: v.localService }));
      if (en.length > 0) setVoices(en);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [isElevenLabs]);

  const preview = (name: string) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance("Hello, I am Krishna. How can I help you?");
    const all = window.speechSynthesis.getVoices();
    const found = all.find((v) => v.name === name);
    if (found) utt.voice = found;
    utt.rate = krishna.rate;
    window.speechSynthesis.speak(utt);
  };

  const activeVoiceLabel = isElevenLabs
    ? krishna.elVoiceName || "EL voice"
    : krishna.voice
      ? krishna.voice.replace("Microsoft ", "").split(" ").slice(0, 2).join(" ")
      : "Pick voice";

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });

  const hasActivity =
    krishna.pendingCommand || krishna.lastError || krishna.conversationHistory.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          title="Conversation history"
          className={hasActivity ? "relative" : ""}
        >
          <MessageSquareIcon className="h-4 w-4" />
          {/* Unread dot when there's a pending or error state */}
          {(krishna.pendingCommand || krishna.lastError) && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Krishna</span>
          {/* Voice indicator / quick-picker */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1 text-muted-foreground"
              title={isElevenLabs ? "ElevenLabs voice — change in Settings › Krishna" : "Pick browser voice"}
              onClick={() => !isElevenLabs && setVoiceOpen((p) => !p)}
            >
              {isElevenLabs
                ? <ZapIcon className="h-3 w-3 text-yellow-500" />
                : <Volume2Icon className="h-3 w-3" />
              }
              <span className={isElevenLabs ? "text-yellow-600 dark:text-yellow-400" : ""}>
                {activeVoiceLabel}
              </span>
              {!isElevenLabs && <ChevronDownIcon className="h-3 w-3" />}
            </Button>

            {/* Browser voice dropdown (only when not using ElevenLabs) */}
            {voiceOpen && !isElevenLabs && (
              <div className="absolute right-0 top-7 z-50 w-72 rounded-md border bg-popover shadow-lg max-h-64 overflow-y-auto">
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide border-b">
                  English voices — click to preview · double-click to select
                </div>
                {voices.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No voices found
                  </div>
                ) : (
                  voices.map((v) => (
                    <div
                      key={v.name}
                      className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-muted flex items-center justify-between group ${
                        krishna.voice === v.name ? "bg-primary/10 font-medium" : ""
                      }`}
                      onClick={() => preview(v.name)}
                      onDoubleClick={() => {
                        krishna.setVoice(v.name);
                        setVoiceOpen(false);
                      }}
                    >
                      <span>{v.name.replace("Microsoft ", "")}</span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                        {v.lang}{krishna.voice === v.name ? " ✓" : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Conversation feed */}
        <div className="max-h-80 overflow-y-auto divide-y">
          {/* Live pending */}
          {krishna.pendingCommand && (
            <div className="px-3 py-2 space-y-1 bg-muted/40">
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-primary mt-0.5">You</span>
                <p className="text-xs text-foreground flex-1">{krishna.pendingCommand}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-600">Krishna</span>
                <LoaderCircleIcon className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">thinking…</span>
              </div>
            </div>
          )}

          {/* Error banner */}
          {krishna.lastError && !krishna.pendingCommand && (
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

          {/* History */}
          {!krishna.pendingCommand &&
            !krishna.lastError &&
            krishna.conversationHistory.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet. Just speak to start.
            </div>
          ) : (
            krishna.conversationHistory.map((turn) => (
              <div key={turn.id} className="px-3 py-2 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-primary mt-0.5">You</span>
                  <p className="text-xs text-foreground flex-1">{turn.userText}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(turn.timestamp)}
                  </span>
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
