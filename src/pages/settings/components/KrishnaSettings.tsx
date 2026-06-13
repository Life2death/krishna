import { Switch, Label, Header } from "@/components";
import { useKrishna } from "@/hooks";

export const KrishnaSettings = () => {
  const { enabled, setKrishnaEnabled } = useKrishna();

  return (
    <div id="krishna" className="space-y-2">
      <Header
        title="Krishna Assistant"
        description="Voice-activated AI assistant — say 'Hey Krishna' followed by your command"
        isMainTitle
      />
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
    </div>
  );
};
