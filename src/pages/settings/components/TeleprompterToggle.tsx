import { Switch, Label, Header } from "@/components";

interface TeleprompterToggleProps {
  /** Controlled pending value — driven by the Settings page. */
  pendingEnabled: boolean;
  /** Called when the user clicks the switch; arms Save Changes. */
  onPendingChange: (next: boolean) => void;
  className?: string;
}

/**
 * Controlled toggle: the Settings page owns the pending state and persists
 * it when the user clicks "Save Changes". This matches the theme/transparency
 * pattern so a single Save button confirms every change on the page.
 */
export const TeleprompterToggle = ({
  pendingEnabled,
  onPendingChange,
  className,
}: TeleprompterToggleProps) => {
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
              {pendingEnabled ? "Disable Teleprompter" : "Enable Teleprompter"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingEnabled
                ? 'A "Reading Mode" pill will appear at the bottom of the app. Tap it to open/close the overlay window.'
                : "When on, a small pill appears at the bottom of the app to launch the overlay window."}
            </p>
          </div>
        </div>
        <Switch
          checked={pendingEnabled}
          onCheckedChange={onPendingChange}
          title={`Toggle teleprompter ${pendingEnabled ? "off" : "on"}`}
        />
      </div>
    </div>
  );
};
