import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface DictationToggleProps {
  className?: string;
}

/**
 * Dedicated permission toggle for the dictation feature — deliberately separate
 * from Computer Control. Dictation only ever types the user's own spoken words
 * into whichever app currently has OS focus; it never moves the mouse, clicks, or
 * sends key combos, so it gets its own narrower, dedicated gate rather than
 * requiring the broad Computer Control toggle to also be enabled.
 */
export const DictationToggle = ({ className }: DictationToggleProps) => {
  const { customizable, toggleDictationEnabled } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleDictationEnabled(checked);
  };

  return (
    <div id="dictation" className={`space-y-2 ${className}`}>
      <Header
        title="Dictation"
        description="Press the Dictation hotkey from anywhere, speak, and Krishna types the transcription into whatever app currently has focus — without switching windows."
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {customizable.dictation.enabled
                ? "Dictation Enabled"
                : "Dictation Disabled"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {customizable.dictation.enabled
                ? "The Dictation hotkey (see Shortcuts) will transcribe your speech and type it into the focused app."
                : "Toggle on to let the Dictation hotkey type transcribed speech into the focused app. Set the hotkey and STT provider in Shortcuts / Settings."}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.dictation.enabled}
          onCheckedChange={handleSwitchChange}
          aria-label="Toggle dictation"
        />
      </div>
    </div>
  );
};
