import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { secureStorage } from "@/lib/secure-storage";

const JOB_HUNTER_TOKEN_KEY = "JOB_HUNTER_API_TOKEN";

export const JobHunterSettings = () => {
  const [tokenInput, setTokenInput] = useState("");
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    secureStorage.get(JOB_HUNTER_TOKEN_KEY).then((token) => {
      setHasSavedToken(!!token);
    });
  }, []);

  const handleSave = async () => {
    if (!tokenInput.trim()) return;
    setError(null);
    try {
      await secureStorage.set(JOB_HUNTER_TOKEN_KEY, tokenInput.trim());
      const stored = await secureStorage.get(JOB_HUNTER_TOKEN_KEY);
      if (!stored) {
        throw new Error("Token did not persist — storage returned empty after save.");
      }
      setHasSavedToken(true);
      setTokenInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save token.");
    }
  };

  return (
    <div id="job-hunter" className="space-y-3">
      <Header
        title="Job Hunter"
        description="API token for the job-hunter service — required for queue reads and assisted apply."
        isMainTitle
      />

      <div className="space-y-1.5 rounded-lg border p-3">
        <Label className="text-sm font-medium">Job-Hunter API Token</Label>
        <p className="text-xs text-muted-foreground">
          Generate a token with{" "}
          <code className="bg-muted px-1 rounded">python -c "import secrets; print(secrets.token_urlsafe(48))"</code>,
          set it as <code className="bg-muted px-1 rounded">KRISHNA_API_TOKEN</code> in the Render dashboard for
          your job-hunter deployment, then paste the same token below.
        </p>
        <div className="flex gap-2 pt-1">
          <input
            type="password"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={hasSavedToken ? "Token saved — paste a new one to replace" : "paste token here"}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <Button size="sm" onClick={handleSave} disabled={!tokenInput.trim()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!error && hasSavedToken && (
          <p className="text-xs text-green-500">✓ Token configured</p>
        )}
      </div>
    </div>
  );
};
