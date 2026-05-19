import { useEffect, useState } from "react";
import { useTheme } from "@/contexts";
import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  TeleprompterToggle,
} from "./components";
import { PageLayout } from "@/layouts";
import { Button } from "@/components";
import { SaveIcon, CheckIcon } from "lucide-react";
import {
  getTeleprompterEnabled,
  setTeleprompterEnabled,
} from "@/lib";
import { closeTeleprompterWindow } from "@/hooks";

type ThemeValue = "dark" | "light" | "system";

const Settings = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();

  const [pendingTheme, setPendingTheme] = useState<ThemeValue>(theme);
  const [pendingTransparency, setPendingTransparency] =
    useState<number>(transparency);
  // Teleprompter — driven from localStorage, persisted on Save Changes
  const [savedTeleprompter, setSavedTeleprompter] = useState<boolean>(false);
  const [pendingTeleprompter, setPendingTeleprompter] = useState<boolean>(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = getTeleprompterEnabled();
    setSavedTeleprompter(current);
    setPendingTeleprompter(current);
  }, []);

  const hasChanges =
    pendingTheme !== theme ||
    pendingTransparency !== transparency ||
    pendingTeleprompter !== savedTeleprompter;

  const handleSave = async () => {
    if (pendingTheme !== theme) setTheme(pendingTheme);
    onSetTransparency(pendingTransparency);

    if (pendingTeleprompter !== savedTeleprompter) {
      setTeleprompterEnabled(pendingTeleprompter);
      setSavedTeleprompter(pendingTeleprompter);
      // Notify the footer pill to show/hide without a reload
      window.dispatchEvent(new CustomEvent("teleprompter-enabled-changed"));
      // If turning OFF, also close any open overlay window
      if (!pendingTeleprompter) {
        try {
          await closeTeleprompterWindow();
        } catch {}
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <PageLayout
      title="Settings"
      description="Manage your settings"
      rightSlot={
        <Button
          size="sm"
          className="gap-2"
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          variant={saved ? "outline" : "default"}
        >
          {saved ? (
            <>
              <CheckIcon className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <SaveIcon className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      }
    >
      {/* Theme */}
      <Theme
        pendingTheme={pendingTheme}
        pendingTransparency={pendingTransparency}
        onThemeChange={setPendingTheme}
        onTransparencyChange={setPendingTransparency}
      />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />

      {/* Teleprompter (reading mode overlay) — persisted on Save Changes */}
      <TeleprompterToggle
        pendingEnabled={pendingTeleprompter}
        onPendingChange={setPendingTeleprompter}
      />
    </PageLayout>
  );
};

export default Settings;
