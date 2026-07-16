import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isMobileDevice } from "@/lib/platform";

/**
 * "Make Krishna your phone's assistant" card. Shows whether Krishna is
 * currently the selected Digital assistant app (best-effort — the OS gives
 * no reliable "changed" signal, so this only re-checks on mount and window
 * focus) and a button that opens the system's default-apps picker so the
 * user can select it. See VOICE_INTERACTION_ASSISTANT_PLAN.md Phase 3.
 */
export default function AssistantRoleCard() {
  const [isAssistant, setIsAssistant] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isMobileDevice()) return;
    let cancelled = false;

    const check = async () => {
      try {
        const result = await invoke<boolean>("android_is_assistant");
        if (!cancelled) setIsAssistant(result);
      } catch {
        if (!cancelled) setIsAssistant(null);
      }
    };

    void check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!isMobileDevice()) return null;

  const openSettings = () => {
    void invoke("android_open_assistant_settings");
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium">Make Krishna your phone's assistant</label>
        <p className="text-xs text-muted-foreground mt-1">
          Long-press home (or your phone's assist gesture) from any app to summon Krishna —
          she'll already be listening.
        </p>
      </div>
      {isAssistant === true && (
        <p className="text-xs text-green-500">Krishna is your current Digital assistant app.</p>
      )}
      {isAssistant === false && (
        <p className="text-xs text-muted-foreground">Not set yet — tap below to choose Krishna.</p>
      )}
      <button
        type="button"
        onClick={openSettings}
        className="text-xs px-3 py-1.5 rounded border border-border/30 bg-background active:scale-95"
      >
        Open assistant settings
      </button>
    </div>
  );
}
