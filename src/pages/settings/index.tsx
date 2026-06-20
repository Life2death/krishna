import { useState } from "react";
import { useTheme } from "@/contexts";
import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  KrishnaSettings,
  Integrations,
  BrainConnection,
} from "./components";
import {
  ResponseLength,
  LanguageSelector,
  AutoScrollToggle,
} from "@/pages/responses/components";
import { PageLayout } from "@/layouts";
import { Button, Header } from "@/components";
import { SaveIcon, CheckIcon } from "lucide-react";

type ThemeValue = "dark" | "light" | "system";

const Settings = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();

  const [pendingTheme, setPendingTheme] = useState<ThemeValue>(theme);
  const [pendingTransparency, setPendingTransparency] =
    useState<number>(transparency);
  const [saved, setSaved] = useState(false);

  const hasChanges =
    pendingTheme !== theme ||
    pendingTransparency !== transparency;

  const handleSave = () => {
    if (pendingTheme !== theme) setTheme(pendingTheme);
    onSetTransparency(pendingTransparency);
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

      {/* Krishna Assistant */}
      <KrishnaSettings />

      {/* Integrations (GitHub, etc.) */}
      <Integrations />

      {/* Brain Connection */}
      <BrainConnection />

      <div className="border-t pt-4">
        <Header
          title="Response Settings"
          description="Customize how AI generates and displays responses"
          isMainTitle
        />
      </div>

      {/* Response Length */}
      <ResponseLength />

      {/* Language Selector */}
      <LanguageSelector />

      {/* Auto-Scroll Toggle */}
      <AutoScrollToggle />

    </PageLayout>
  );
};

export default Settings;
