import { Header } from "@/components";
import { updateVoiceMaxTokens } from "@/lib/storage/response-settings.storage";
import { useState, useEffect } from "react";
import { getResponseSettings } from "@/lib";

export const VoiceMaxTokensInput = () => {
  const [voiceMaxTokens, setVoiceMaxTokens] = useState<number>(100);

  useEffect(() => {
    const settings = getResponseSettings();
    setVoiceMaxTokens(settings.voiceMaxTokens);
  }, []);

  const handleChange = (value: string) => {
    const num = Math.max(50, Math.min(500, parseInt(value, 10) || 100));
    setVoiceMaxTokens(num);
    updateVoiceMaxTokens(num);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Voice Max Tokens"
        description="Maximum output tokens for voice replies (50–500). Lower values produce shorter, faster speech. Changes apply to the next voice turn."
        isMainTitle
      />

      <div className="max-w-md">
        <input
          type="number"
          min={50}
          max={500}
          value={voiceMaxTokens}
          onChange={(e) => handleChange(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
};
