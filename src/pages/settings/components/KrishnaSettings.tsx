import { useState, useEffect } from "react";
import { Switch, Label, Header, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Slider } from "@/components";
import { useKrishna } from "@/hooks";

export const KrishnaSettings = () => {
  const { enabled, setKrishnaEnabled, voice, setVoice, rate, setRate } = useKrishna();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const enVoices = voices.filter((v) => v.lang.startsWith("en"));

  return (
    <div id="krishna" className="space-y-4">
      <Header
        title="Krishna Assistant"
        description="Voice-activated AI assistant — say 'Hey Krishna' followed by your command"
        isMainTitle
      />

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">Enable Krishna</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {enabled
                ? "Krishna listens for 'Hey Krishna' during system audio capture"
                : "Krishna is disabled"}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setKrishnaEnabled}
          aria-label="Toggle Krishna assistant"
        />
      </div>

      {/* Voice picker */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Voice</Label>
        <Select value={voice} onValueChange={setVoice}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Default voice" />
          </SelectTrigger>
          <SelectContent>
            {enVoices.map((v) => (
              <SelectItem key={v.name} value={v.name}>
                {v.name.replace("Microsoft ", "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rate slider */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-sm font-medium">Speech rate</Label>
          <span className="text-xs text-muted-foreground">{rate.toFixed(1)}x</span>
        </div>
        <Slider
          value={[rate]}
          onValueChange={([v]) => setRate(v)}
          min={0.5}
          max={2.0}
          step={0.1}
        />
      </div>
    </div>
  );
};
