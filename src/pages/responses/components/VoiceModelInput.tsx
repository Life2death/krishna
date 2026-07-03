import { Header } from "@/components";
import { updateVoiceModel } from "@/lib/storage/response-settings.storage";
import { useState, useEffect } from "react";
import { getResponseSettings } from "@/lib";

export const VoiceModelInput = () => {
  const [voiceModel, setVoiceModel] = useState<string>("");

  useEffect(() => {
    const settings = getResponseSettings();
    setVoiceModel(settings.voiceModel);
  }, []);

  const handleChange = (value: string) => {
    setVoiceModel(value);
    updateVoiceModel(value);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Voice Model"
        description="Model override for voice turns (e.g. claude-haiku-4-5). Leave empty to use the provider's default model. Changes apply to the next voice turn."
        isMainTitle
      />

      <div className="max-w-md">
        <input
          type="text"
          value={voiceModel}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="(provider default)"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
};
