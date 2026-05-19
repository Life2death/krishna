import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { getTeleprompterEnabled } from "@/lib";
import { useTeleprompterController } from "@/hooks";
import { cn } from "@/lib/utils";

/**
 * Small footer-anchored toggle that opens/closes the floating teleprompter
 * (reading-mode) overlay. Only renders when the user has switched the
 * Teleprompter setting on inside App Settings.
 */
export const TeleprompterFooterToggle = () => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const { isOpen, toggle } = useTeleprompterController();

  useEffect(() => {
    const refresh = () => setEnabled(getTeleprompterEnabled());
    refresh();
    const onChange = () => refresh();
    window.addEventListener("teleprompter-enabled-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("teleprompter-enabled-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={
        isOpen
          ? "Close reading-mode overlay"
          : "Open reading-mode overlay (top of screen)"
      }
      className={cn(
        "fixed bottom-3 left-1/2 -translate-x-1/2 z-40",
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
        "text-[11px] font-medium shadow-md border",
        "transition-colors",
        isOpen
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:border-primary/60 hover:bg-primary/8"
      )}
    >
      {isOpen ? (
        <EyeOffIcon className="h-3 w-3" />
      ) : (
        <EyeIcon className="h-3 w-3" />
      )}
      {isOpen ? "Reading Mode · On" : "Reading Mode"}
    </button>
  );
};
