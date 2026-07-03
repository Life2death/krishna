import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { secureStorage } from "@/lib/secure-storage";

const MAPS_API_KEY_STORAGE_KEY = "GOOGLE_MAPS_API_KEY";

export const MapsSettings = () => {
  const [keyInput, setKeyInput] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    secureStorage.get(MAPS_API_KEY_STORAGE_KEY).then((key) => {
      setHasSavedKey(!!key);
    });
  }, []);

  const handleSave = async () => {
    if (!keyInput.trim()) return;
    setError(null);
    try {
      await secureStorage.set(MAPS_API_KEY_STORAGE_KEY, keyInput.trim());
      const stored = await secureStorage.get(MAPS_API_KEY_STORAGE_KEY);
      if (!stored) {
        throw new Error("Key did not persist — storage returned empty after save.");
      }
      setHasSavedKey(true);
      setKeyInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save API key.");
    }
  };

  return (
    <div id="maps" className="space-y-3">
      <Header
        title="Maps"
        description="Google Maps API key for live traffic and travel-time lookups."
        isMainTitle
      />

      <div className="space-y-1.5 rounded-lg border p-3">
        <Label className="text-sm font-medium">Google Maps API Key</Label>
        <p className="text-xs text-muted-foreground">
          Get a key from the{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Google Cloud Console
          </a>
          {" "}— enable the Routes API and restrict the key to it. Krishna uses this to
          read out travel times and traffic conditions live.
        </p>
        <div className="flex gap-2 pt-1">
          <input
            type="password"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={hasSavedKey ? "Key saved — paste a new one to replace" : "AIza..."}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <Button size="sm" onClick={handleSave} disabled={!keyInput.trim()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!error && hasSavedKey && (
          <p className="text-xs text-green-500">✓ API key configured</p>
        )}
      </div>
    </div>
  );
};
