import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { secureStorage } from "@/lib/secure-storage";
import { GITHUB_PAT_STORAGE_KEY } from "@/lib/integrations/github-workflow";

export const Integrations = () => {
  const [patInput, setPatInput] = useState("");
  const [hasSavedPat, setHasSavedPat] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    secureStorage.get(GITHUB_PAT_STORAGE_KEY).then((key) => {
      setHasSavedPat(!!key);
    });
  }, []);

  const handleSave = async () => {
    if (!patInput.trim()) return;
    await secureStorage.set(GITHUB_PAT_STORAGE_KEY, patInput.trim());
    setHasSavedPat(true);
    setPatInput("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div id="integrations" className="space-y-3">
      <Header
        title="Integrations"
        description="Connect external services Krishna can trigger by voice or text."
        isMainTitle
      />

      <div className="space-y-1.5 rounded-lg border p-3">
        <Label className="text-sm font-medium">GitHub — Job Hunter</Label>
        <p className="text-xs text-muted-foreground">
          Lets you say "run my daily job extraction" to instantly trigger the
          job-hunter workflow on GitHub instead of waiting for the scheduled run.
          Create a{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            fine-grained Personal Access Token
          </a>{" "}
          scoped to only the <code>job-hunter</code> repo with{" "}
          <strong>Actions: Read and write</strong> permission, then paste it below.
        </p>
        <div className="flex gap-2 pt-1">
          <input
            type="password"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={hasSavedPat ? "Token saved — paste a new one to replace" : "github_pat_..."}
            value={patInput}
            onChange={(e) => setPatInput(e.target.value)}
          />
          <Button size="sm" onClick={handleSave} disabled={!patInput.trim()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
        {hasSavedPat && (
          <p className="text-xs text-green-500">✓ Token configured</p>
        )}
      </div>
    </div>
  );
};
