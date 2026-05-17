import { useState, useEffect } from "react";
import { Button, Input, Label } from "@/components";
import {
  BriefcaseIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  KeyIcon,
  ZapIcon,
} from "lucide-react";
import { getJobProviderConfig, setJobProviderConfig } from "@/lib";
import { JobProviderId, JobProviderConfig } from "@/types";
import { cn } from "@/lib/utils";

const PROVIDERS: {
  id: JobProviderId;
  name: string;
  free: string;
  url: string;
  placeholder: string;
}[] = [
  {
    id: "serper",
    name: "Serper.dev",
    free: "2,500 queries/month free",
    url: "https://serper.dev",
    placeholder: "paste your Serper API key here",
  },
  {
    id: "tavily",
    name: "Tavily",
    free: "1,000 queries/month free",
    url: "https://tavily.com",
    placeholder: "tvly-xxxxxxxxxxxxxxxxxxxx",
  },
];

export const JobDiscoveryConfig = () => {
  const [activeProvider, setActiveProvider] =
    useState<JobProviderId>("serper");
  const [tavilyKey, setTavilyKey] = useState("");
  const [serperKey, setSerperKey] = useState("");
  const [showKeys, setShowKeys] = useState<Record<JobProviderId, boolean>>({
    serper: false,
    tavily: false,
  });
  const [isSaved, setIsSaved] = useState(false);
  const [isTesting, setIsTesting] = useState<JobProviderId | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const cfg = getJobProviderConfig();
    if (cfg) {
      setActiveProvider(cfg.activeProvider);
      setTavilyKey(cfg.tavilyKey || "");
      setSerperKey(cfg.serperKey || "");
    }
  }, []);

  const getKeyForProvider = (id: JobProviderId) =>
    id === "tavily" ? tavilyKey : serperKey;

  const setKeyForProvider = (id: JobProviderId, val: string) => {
    if (id === "tavily") setTavilyKey(val);
    else setSerperKey(val);
  };

  const persist = (next: Partial<JobProviderConfig>) => {
    const cfg: JobProviderConfig = {
      activeProvider,
      tavilyKey: tavilyKey.trim(),
      serperKey: serperKey.trim(),
      ...next,
    };
    setJobProviderConfig(cfg);
  };

  const handleActivate = (id: JobProviderId) => {
    const key = getKeyForProvider(id);
    if (!key.trim()) return;
    setActiveProvider(id);
    persist({ activeProvider: id });
  };

  const handleSave = () => {
    persist({});
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    setTestResult(null);
  };

  const handleTest = async (providerId: JobProviderId) => {
    const key = getKeyForProvider(providerId).trim();
    if (!key) return;
    setIsTesting(providerId);
    setTestResult(null);
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      if (providerId === "serper") {
        const res = await tauriFetch("https://google.serper.dev/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": key,
          },
          body: JSON.stringify({ q: "software engineer jobs", num: 3 }),
        });
        if (res.ok) {
          const data = (await res.json()) as { jobs?: unknown[] };
          setTestResult(
            `✓ Serper connected — returned ${data.jobs?.length ?? 0} jobs`
          );
        } else {
          const text = await res.text();
          setTestResult(
            `✗ Serper error ${res.status}: ${text.substring(0, 120)}`
          );
        }
      } else {
        const res = await tauriFetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: key,
            query: "software engineer jobs",
            max_results: 3,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { results?: unknown[] };
          setTestResult(
            `✓ Tavily connected — returned ${data.results?.length ?? 0} results`
          );
        } else {
          const text = await res.text();
          setTestResult(
            `✗ Tavily error ${res.status}: ${text.substring(0, 120)}`
          );
        }
      }
    } catch (err) {
      setTestResult(
        `✗ ${err instanceof Error ? err.message : "Connection failed"}`
      );
    } finally {
      setIsTesting(null);
    }
  };

  const canSave = !!(tavilyKey.trim() || serperKey.trim());

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <BriefcaseIcon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Job Discovery</h3>
          <p className="text-xs text-muted-foreground">
            Save both keys — click "Make active" to choose which provider is
            used. The active provider is highlighted in green.
          </p>
        </div>
      </div>

      {/* Provider cards with inline key inputs */}
      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const isActive = activeProvider === p.id;
          const keyVal = getKeyForProvider(p.id);
          const hasKey = !!keyVal.trim();
          const testing = isTesting === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border-2 p-3 space-y-3 transition-all",
                isActive
                  ? "border-green-500 bg-green-500/10 shadow-[0_0_0_1px_rgba(34,197,94,0.2)]"
                  : "border-border bg-card"
              )}
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      {p.name}
                      {isActive && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-700 dark:text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full">
                          <ZapIcon className="h-2 w-2" />
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.free}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasKey && !isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => handleActivate(p.id)}
                    >
                      Make active
                    </Button>
                  )}
                  {hasKey && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2"
                      disabled={testing}
                      onClick={() => handleTest(p.id)}
                    >
                      {testing ? (
                        <Loader2Icon className="h-2.5 w-2.5 animate-spin" />
                      ) : null}
                      Test
                    </Button>
                  )}
                </div>
              </div>

              {/* API key input */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium flex items-center gap-1 text-muted-foreground">
                  <KeyIcon className="h-2.5 w-2.5" />
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    type={showKeys[p.id] ? "text" : "password"}
                    placeholder={p.placeholder}
                    value={keyVal}
                    onChange={(e) => setKeyForProvider(p.id, e.target.value)}
                    className="pr-9 font-mono text-xs h-8"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setShowKeys((prev) => ({
                        ...prev,
                        [p.id]: !prev[p.id],
                      }))
                    }
                  >
                    {showKeys[p.id] ? (
                      <EyeOffIcon className="h-3.5 w-3.5" />
                    ) : (
                      <EyeIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Get free key at{" "}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {p.url}
                  </a>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Test result */}
      {testResult && (
        <p
          className={cn(
            "text-xs rounded-md px-3 py-2 border",
            testResult.startsWith("✓")
              ? "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20"
              : "text-destructive bg-destructive/10 border-destructive/20"
          )}
        >
          {testResult}
        </p>
      )}

      {/* Save All button */}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!canSave}
        className="w-full"
      >
        {isSaved ? <CheckIcon className="h-3 w-3" /> : null}
        {isSaved ? "Saved!" : "Save All Keys"}
      </Button>
    </div>
  );
};

export default JobDiscoveryConfig;
