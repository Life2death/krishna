import { useState, useCallback } from "react";
import { Button, Header } from "@/components";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SparklesIcon, LoaderCircleIcon, CheckIcon, AlertCircleIcon } from "lucide-react";
import { getRepo } from "@/lib/repo-selector";
import { readBrainConfig } from "@/lib/remote/remote-client";
import { createSkill } from "@/lib/repo-bound";

interface GeneratedSkill {
  triggerExamples: string;
  params: string[];
  planTemplate: unknown[];
}

export function CreateSkillDialog() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedSkill | null>(null);
  const [saved, setSaved] = useState(false);

  const generate = useCallback(async () => {
    if (!description.trim()) return;

    setLoading(true);
    setError(null);
    setGenerated(null);
    setSaved(false);

    try {
      const repo = getRepo();
      if (repo.mode === "remote") {
        const config = readBrainConfig();
        const baseUrl = config.brainUrl.replace(/\/+$/, "");
        const res = await fetch(`${baseUrl}/skills/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.brainToken}`,
          },
          body: JSON.stringify({ description }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "Unknown error");
          throw new Error(`Brain error: ${res.status} ${text}`);
        }
        const skill = await res.json();
        setGenerated({
          triggerExamples: skill.triggerExamples,
          params: JSON.parse(skill.params),
          planTemplate: JSON.parse(skill.planTemplate),
        });
      } else {
        // Local mode: use the configured AI provider to generate
        // (imports fetchAIResponse dynamically to avoid circular deps)
        const { fetchAIResponse } = await import("@/lib/functions");
        const { useApp } = await import("@/contexts");
        // Fallback: show instructions to use brain in remote mode
        throw new Error("Skill generation requires remote brain mode. Configure a brain connection in Settings.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [description]);

  const confirmSave = useCallback(async () => {
    if (!generated) return;
    try {
      const name = generated.triggerExamples
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join("-");

      const skill = {
        id: Date.now(),
        name,
        triggerExamples: generated.triggerExamples,
        params: JSON.stringify(generated.params),
        planTemplate: JSON.stringify(generated.planTemplate),
        confirmedByUser: 1,
        useCount: 0,
        createdAt: Date.now(),
      };
      await createSkill(skill);
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
        setDescription("");
        setGenerated(null);
        setSaved(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save skill");
    }
  }, [generated]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <SparklesIcon className="h-4 w-4" />
          Create Skill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a Skill</DialogTitle>
          <DialogDescription>
            Describe what you want Krishna to do. The AI will generate a reusable skill recipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <textarea
            className="w-full min-h-[80px] p-3 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder='e.g. "Search YouTube for {query} and play the first result"'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded-md">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              Generating skill...
            </div>
          )}

          {generated && !loading && (
            <div className="space-y-3 rounded-md border bg-muted/50 p-4">
              <p className="text-sm font-medium">Generated Skill</p>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Trigger:</span>{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{generated.triggerExamples}</code>
                </div>
                <div>
                  <span className="font-medium">Params:</span>{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {JSON.stringify(generated.params)}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Steps:</span>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(generated.planTemplate, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          {generated && !loading ? (
            <Button onClick={confirmSave} disabled={saved}>
              {saved ? (
                <>
                  <CheckIcon className="h-4 w-4 mr-1" />
                  Saved
                </>
              ) : (
                "Save Skill"
              )}
            </Button>
          ) : (
            <Button onClick={generate} disabled={loading || !description.trim()}>
              {loading ? "Generating..." : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
