import { Switch, Label, Header } from "@/components";
import {
  getTeleprompterEnabled,
  setTeleprompterEnabled,
  closeTeleprompterWindow,
} from "@/lib";
import { useEffect, useState } from "react";

interface TeleprompterToggleProps {
  className?: string;
}

export const TeleprompterToggle = ({ className }: TeleprompterToggleProps) => {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(getTeleprompterEnabled());
  }, []);

  const handleChange = async (checked: boolean) => {
    setTeleprompterEnabled(checked);
    setEnabled(checked);
    // Notify any listeners (footer toggle button) without a full reload
    window.dispatchEvent(new CustomEvent("teleprompter-enabled-changed"));
    // If user is turning it OFF, also close any open teleprompter window
    if (!checked) {
      try {
        await closeTeleprompterWindow();
      } catch {}
    }
  };

  return (
    <div id="teleprompter" className={`space-y-2 ${className ?? ""}`}>
      <Header
        title="Teleprompter"
        description="Show answers in a small overlay positioned at the top of the screen — close to the webcam so reading-gaze stays natural during interviews."
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {enabled ? "Disable Teleprompter" : "Enable Teleprompter"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {enabled
                ? 'A "Reading Mode" toggle appears at the bottom of the app. Tap it to open/close the overlay.'
                : "When on, a small toggle appears at the bottom of the app to launch the overlay window."}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleChange}
          title={`Toggle teleprompter ${enabled ? "off" : "on"}`}
        />
      </div>
    </div>
  );
};
