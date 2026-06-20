import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { readBrainConfig, saveBrainConfig, remoteHealth } from "@/lib/remote";
import { resetRepoCache } from "@/lib/repo-selector";
import type { BrainConfig } from "@/lib/remote";

export const BrainConnection = () => {
  const [config, setConfig] = useState<BrainConfig>(readBrainConfig);
  const [brainUrl, setBrainUrl] = useState(config.brainUrl);
  const [brainToken, setBrainToken] = useState(config.brainToken);
  const [brainMode, setBrainMode] = useState<"local" | "remote">(config.brainMode);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    brainUrl !== config.brainUrl ||
    brainToken !== config.brainToken ||
    brainMode !== config.brainMode;

  const handleSave = () => {
    const newConfig: BrainConfig = { brainMode, brainUrl, brainToken };
    saveBrainConfig(newConfig);
    setConfig(newConfig);
    resetRepoCache();
    setSaved(true);
    setError(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestConnection = async () => {
    setTestResult("checking");
    setError(null);
    const ok = await remoteHealth({ brainMode, brainUrl, brainToken });
    setTestResult(ok ? "ok" : "fail");
    if (ok) {
      setTimeout(() => setTestResult("idle"), 3000);
    }
  };

  useEffect(() => {
    if (testResult === "fail") {
      const t = setTimeout(() => setTestResult("idle"), 5000);
      return () => clearTimeout(t);
    }
  }, [testResult]);

  return (
    <div id="brain-connection" className="space-y-3">
      <Header
        title="Brain Connection"
        description="Connect to the Krishna Brain for cross-device sync. The brain runs as a headless Node service on your laptop."
        isMainTitle
      />

      <div className="space-y-3 rounded-lg border p-3">
        {/* Mode toggle */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Mode</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="brainMode"
                value="local"
                checked={brainMode === "local"}
                onChange={() => setBrainMode("local")}
                className="accent-primary"
              />
              Local (SQLite)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="brainMode"
                value="remote"
                checked={brainMode === "remote"}
                onChange={() => setBrainMode("remote")}
                className="accent-primary"
              />
              Remote (Brain)
            </label>
          </div>
        </div>

        {brainMode === "remote" && (
          <>
            {/* Brain URL */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Brain URL</Label>
              <p className="text-xs text-muted-foreground">
                The HTTP address of your brain server (e.g. http://192.168.1.42:8787)
              </p>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="http://localhost:8787"
                value={brainUrl}
                onChange={(e) => setBrainUrl(e.target.value)}
              />
            </div>

            {/* Token */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Auth Token</Label>
              <p className="text-xs text-muted-foreground">
                The KRISHNA_BRAIN_TOKEN from your brain&apos;s .env file
              </p>
              <input
                type="password"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Bearer token"
                value={brainToken}
                onChange={(e) => setBrainToken(e.target.value)}
              />
            </div>

            {/* Test connection */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testResult === "checking" || !brainUrl || !brainToken}
              >
                {testResult === "checking" ? "Testing..." : "Test Connection"}
              </Button>
              {testResult === "ok" && (
                <span className="text-xs text-green-500">✓ Connected</span>
              )}
              {testResult === "fail" && (
                <span className="text-xs text-red-500">✗ Connection failed</span>
              )}
            </div>
          </>
        )}

        {/* Error display */}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Save button */}
        {hasChanges && (
          <Button size="sm" onClick={handleSave}>
            {saved ? "Saved" : "Save"}
          </Button>
        )}
        {!hasChanges && saved && (
          <p className="text-xs text-green-500">✓ Settings saved</p>
        )}
      </div>
    </div>
  );
};
