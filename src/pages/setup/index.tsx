import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Label } from "@/components";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { secureStorage } from "@/lib/secure-storage";
import { CheckIcon, ChevronRightIcon, ChevronLeftIcon, KeyIcon, SparklesIcon } from "lucide-react";

type SetupStep = "welcome" | "api-key" | "master-key" | "sync" | "done";

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  let result = "kr_";
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
}

function generateMasterKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+";
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
}

const steps: { id: SetupStep; title: string; description: string }[] = [
  { id: "welcome", title: "Welcome to Krishna", description: "Set up your brain in a few steps" },
  { id: "api-key", title: "Anthropic API Key", description: "Required for AI responses" },
  { id: "master-key", title: "Encryption Key", description: "Protects your data at rest and in sync" },
  { id: "sync", title: "Cloud Sync (Optional)", description: "Sync your data across devices with Turso" },
  { id: "done", title: "Ready", description: "All set — save and get started" },
];

const stepIds = steps.map((s) => s.id);

export default function Setup() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
  const stepIndex = stepIds.indexOf(currentStep);

  const [anthropicKey, setAnthropicKey] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [useAutoMasterKey, setUseAutoMasterKey] = useState(true);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brainToken = useMemo(generateToken, []);
  const autoMasterKey = useMemo(generateMasterKey, []);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case "api-key":
        return anthropicKey.trim().length > 0;
      case "master-key":
        return useAutoMasterKey || masterKey.trim().length >= 16;
      default:
        return true;
    }
  };

  const nextStep = () => {
    setError(null);
    const nextIdx = stepIndex + 1;
    if (nextIdx < stepIds.length) {
      setCurrentStep(stepIds[nextIdx] as SetupStep);
    }
  };

  const prevStep = () => {
    setError(null);
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      setCurrentStep(stepIds[prevIdx] as SetupStep);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const finalMasterKey = useAutoMasterKey ? autoMasterKey : masterKey;

      await secureStorage.set("KRISHNA_BRAIN_TOKEN", brainToken);
      await secureStorage.set("ANTHROPIC_API_KEY", anthropicKey.trim());
      await secureStorage.set("KRISHNA_MASTER_KEY", finalMasterKey);
      await secureStorage.set("KRISHNA_CLAUDE_MODEL", "claude-sonnet-4-6");
      await secureStorage.set("KRISHNA_RAG_DISABLED", "true");

      if (syncUrl.trim()) {
        await secureStorage.set("KRISHNA_SYNC_URL", syncUrl.trim());
      }
      if (syncToken.trim()) {
        await secureStorage.set("KRISHNA_SYNC_TOKEN", syncToken.trim());
      }

      setCurrentStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
    setSaving(false);
  };

  const handleFinish = () => {
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/20 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" />
            <CardTitle>Krishna</CardTitle>
          </div>
          <CardDescription>
            {steps[stepIndex].description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Steps indicator */}
          <div className="flex gap-2">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-primary" : "bg-secondary"
                }`}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Step: Welcome */}
          {currentStep === "welcome" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
                <SparklesIcon className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Welcome to Krishna!</h2>
              <p className="text-sm text-muted-foreground">
                Your AI voice assistant needs a few things configured before it can start.
                This takes just a minute.
              </p>
              <ul className="space-y-2 text-left text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <KeyIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Connect your Anthropic API key for AI responses</span>
                </li>
                <li className="flex items-start gap-2">
                  <KeyIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Set up encryption to protect your data</span>
                </li>
                <li className="flex items-start gap-2">
                  <KeyIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Optionally configure cloud sync with Turso</span>
                </li>
              </ul>
            </div>
          )}

          {/* Step: Anthropic API Key */}
          {currentStep === "api-key" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="anthropic-key">Anthropic API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Your key is stored encrypted on this device. Get one from{" "}
                  <a
                    href="https://console.anthropic.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    console.anthropic.com
                  </a>
                </p>
                <Input
                  id="anthropic-key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step: Master Key */}
          {currentStep === "master-key" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Encryption Key</Label>
                <p className="text-xs text-muted-foreground">
                  Used to encrypt your memories, token, and synced data. For single-device use,
                  auto-generate is recommended.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="masterKeyMode"
                  checked={useAutoMasterKey}
                  onChange={() => setUseAutoMasterKey(true)}
                  className="accent-primary"
                />
                Auto-generate a secure key
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="masterKeyMode"
                  checked={!useAutoMasterKey}
                  onChange={() => setUseAutoMasterKey(false)}
                  className="accent-primary"
                />
                Use my own key
              </label>
              {!useAutoMasterKey && (
                <Input
                  type="password"
                  placeholder="At least 16 characters"
                  value={masterKey}
                  onChange={(e) => setMasterKey(e.target.value)}
                />
              )}
              {useAutoMasterKey && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground break-all font-mono">
                    {autoMasterKey}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                If you use multiple devices, use the same master key on all of them so synced data
                can be decrypted.
              </p>
            </div>
          )}

          {/* Step: Sync */}
          {currentStep === "sync" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="sync-url">Turso Database URL</Label>
                <p className="text-xs text-muted-foreground">
                  Create a free database at{" "}
                  <a
                    href="https://turso.tech"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    turso.tech
                  </a>{" "}
                  (optional — skip for local-only use)
                </p>
                <Input
                  id="sync-url"
                  type="text"
                  placeholder="libsql://your-db.turso.io"
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-token">Turso Auth Token</Label>
                <Input
                  id="sync-token"
                  type="password"
                  placeholder="Your Turso database token"
                  value={syncToken}
                  onChange={(e) => setSyncToken(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step: Done */}
          {currentStep === "done" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckIcon className="size-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold">All Set!</h2>
              <p className="text-sm text-muted-foreground">
                Krishna is ready to use. The brain token and settings have been saved securely.
                Head to the dashboard to start.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 text-left text-xs text-muted-foreground">
                <p className="font-medium mb-1">What was configured:</p>
                <ul className="space-y-1">
                  <li>✓ Anthropic API Key</li>
                  <li>✓ Encryption Master Key</li>
                  <li>✓ KRISHNA_BRAIN_TOKEN generated</li>
                  <li>✓ RAG disabled (v1 default)</li>
                  {syncUrl.trim() && <li>✓ Turso sync configured</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-2">
            <div>
              {currentStep !== "welcome" && currentStep !== "done" && (
                <Button variant="outline" size="sm" onClick={prevStep}>
                  <ChevronLeftIcon className="size-4" />
                  Back
                </Button>
              )}
            </div>
            <div>
              {currentStep === "done" ? (
                <Button size="sm" onClick={handleFinish}>
                  Go to Dashboard
                  <ChevronRightIcon className="size-4" />
                </Button>
              ) : currentStep === "sync" ? (
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save & Finish"}
                </Button>
              ) : (
                <Button size="sm" onClick={nextStep} disabled={!canProceed()}>
                  Next
                  <ChevronRightIcon className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
