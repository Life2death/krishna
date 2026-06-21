import { MicIcon, MicOffIcon, AlertCircleIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useMobileSpeech } from "@/hooks";

/**
 * Push-to-talk button for mobile devices.
 * Uses the Web Speech API (webkitSpeechRecognition) which is built into
 * Android Chrome WebView — no STT provider API key needed.
 */
export function MobileVoiceButton() {
  const { isListening, isSupported, error, startListening, stopListening } =
    useMobileSpeech();

  // Mobile-only push-to-talk. On desktop the always-on KrishnaVAD mic already
  // covers voice, and webkitSpeechRecognition is also "supported" in the desktop
  // WebView — so without this guard the bar showed two mic buttons.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile || !isSupported) {
    return null;
  }

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const getTitle = (): string => {
    if (error) return `Error: ${error}`;
    if (isListening) return "Tap to stop listening";
    return "Tap to speak";
  };

  return (
    <Button
      size="icon"
      title={getTitle()}
      onClick={handleToggle}
      className={
        isListening
          ? "bg-green-500 hover:bg-green-600 animate-pulse"
          : "bg-blue-500 hover:bg-blue-600"
      }
    >
      {error ? (
        <AlertCircleIcon className="h-4 w-4 text-white" />
      ) : isListening ? (
        <MicIcon className="h-4 w-4 text-white" />
      ) : (
        <MicOffIcon className="h-4 w-4 text-white" />
      )}
    </Button>
  );
}
