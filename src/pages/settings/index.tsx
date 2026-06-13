import { useEffect, useState } from "react";
import { useTheme } from "@/contexts";
import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  ProfileContextLimits,
  KrishnaSettings,
} from "./components";
import { PageLayout } from "@/layouts";
import { Button } from "@/components";
import { SaveIcon, CheckIcon } from "lucide-react";
import {
  getProfileContextSettings,
  setProfileContextSettings,
} from "@/lib";

type ThemeValue = "dark" | "light" | "system";

const Settings = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();

  const [pendingTheme, setPendingTheme] = useState<ThemeValue>(theme);
  const [pendingTransparency, setPendingTransparency] =
    useState<number>(transparency);
  const [saved, setSaved] = useState(false);

  const [savedProfileContext, setSavedProfileContext] = useState(
    getProfileContextSettings()
  );
  const [pendingProfileContext, setPendingProfileContext] = useState(
    getProfileContextSettings()
  );

  useEffect(() => {
    const pc = getProfileContextSettings();
    setSavedProfileContext(pc);
    setPendingProfileContext(pc);
  }, []);

  const hasChanges =
    pendingTheme !== theme ||
    pendingTransparency !== transparency ||
    JSON.stringify(pendingProfileContext) !== JSON.stringify(savedProfileContext);

  const handleSave = () => {
    if (pendingTheme !== theme) setTheme(pendingTheme);
    onSetTransparency(pendingTransparency);

    if (JSON.stringify(pendingProfileContext) !== JSON.stringify(savedProfileContext)) {
      setProfileContextSettings(pendingProfileContext);
      setSavedProfileContext(pendingProfileContext);
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
      {/* Profile Context Limits — persisted on Save Changes */}
      <ProfileContextLimits
        pending={pendingProfileContext}
        onChange={setPendingProfileContext}
      />

      {/* Krishna Assistant */}
      <KrishnaSettings />

    </PageLayout>
  );
};

export default Settings;
