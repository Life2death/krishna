import { Badge, Empty, Button } from "@/components";
import { useCommandInsights, useSystemHealth } from "@/hooks";
import { PageLayout } from "@/layouts";
import {
  XCircleIcon, BarChart3Icon, LightbulbIcon, RefreshCwIcon,
  BrainCircuitIcon, DatabaseIcon, CloudIcon, MailIcon,
  SearchIcon, CpuIcon, PuzzleIcon, HardDriveIcon,
} from "lucide-react";
import moment from "moment";
import { useState } from "react";
import type { FailureReason } from "@/lib/database";
import { readBrainConfig } from "@/lib/remote";

const FAILURE_LABELS: Record<FailureReason, string> = {
  stt_failed: "Speech recognition failed",
  no_stt_provider: "No speech provider",
  no_ai_provider: "No AI provider configured",
  ai_error: "AI provider error",
  plan_failed: "Plan execution failed",
  tool_failed: "Tool execution failed",
  wake_word_missed: "Wake word not detected",
  user_declined: "User declined",
  unknown: "Unknown error",
};

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", label: "In progress" },
  answered: { color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", label: "Answered" },
  failed: { color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", label: "Failed" },
  declined: { color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", label: "Declined" },
};

const FAILURE_HINTS: Partial<Record<FailureReason, string>> = {
  no_ai_provider: "Open Settings → Brain to configure an AI provider.",
  no_stt_provider: "Open Settings → Speech to configure a speech provider.",
  stt_failed: "Check your microphone permissions and STT provider key.",
  plan_failed: "Krishna keeps failing on this command. Try rephrasing it.",
  tool_failed: "Krishna keeps failing on this command. Try rephrasing it.",
  wake_word_missed: "Consider disabling the wake word or changing it in Settings.",
};

const HEALTH_CARDS: Array<{
  key: keyof import("@/hooks/useSystemHealth").HealthStatus;
  icon: typeof BrainCircuitIcon;
  label: string;
  detail: (s: any) => string;
}> = [
  { key: "brain", icon: BrainCircuitIcon, label: "Brain", detail: (s) => s.ok ? `Up ${fmtDuration(s.uptimeSec)}` : "Unreachable" },
  { key: "sync", icon: CloudIcon, label: "Cloud Sync", detail: syncDetail },
  { key: "gmail", icon: MailIcon, label: "Gmail", detail: gmailDetail },
  { key: "rag", icon: SearchIcon, label: "RAG", detail: (s) => s.enabled ? (s.ready ? `${s.embeddings ?? 0} embeddings` : "Indexing…") : "Disabled" },
  { key: "ai", icon: CpuIcon, label: "AI Provider", detail: (s) => s.keyConfigured ? s.model : "Not configured" },
  { key: "mcp", icon: PuzzleIcon, label: "MCP Tools", detail: (s) => `${s.tools} tool(s)` },
  { key: "data", icon: HardDriveIcon, label: "Data", detail: (s) => `${s.memories ?? "?"} memories · ${s.conversations ?? "?"} conversations` },
];

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function syncDetail(s: any): string {
  if (!s.enabled) return "Local only — not syncing to cloud";
  if (s.lastError) return `Sync error: ${s.lastError}`;
  if (s.lastSyncAt) {
    const ago = moment(s.lastSyncAt).fromNow();
    return `Synced ${ago} · ${s.host ?? "?"} · every ${s.intervalSec}s`;
  }
  return "Waiting for first sync…";
}

function gmailDetail(s: any): string {
  if (!s.configured) return "Not configured";
  if (!s.tokenPresent) return "No token — run gmail:auth";
  if (s.expired) return "Token expired — re-run gmail:auth";
  if (s.expiryDate) {
    const remaining = s.expiryDate - Date.now();
    if (remaining < 86_400_000) return `Token expires ${moment(s.expiryDate).fromNow()}`;
  }
  return `${s.tools} tool(s) ready`;
}

function healthColor(s: any): "ok" | "warn" | "err" {
  if (!s) return "err";
  if (s.ok === false) return "err";
  if (s.ok === true) return "ok";
  return "warn";
}

function badgeForColor(c: "ok" | "warn" | "err"): { color: string; bg: string; label: string } {
  switch (c) {
    case "ok": return { color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", label: "OK" };
    case "warn": return { color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", label: "Warning" };
    case "err": return { color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", label: "Error" };
  }
}

const Status = () => {
  const { stats, recent, isLoading: ciLoading, clearAll: clearCommandLog } = useCommandInsights();
  const { status, error, lastCheckedAt, isLoading: healthLoading, refresh, forceSync } = useSystemHealth();
  const [confirmClear, setConfirmClear] = useState(false);
  const topFailure = stats.byReason[0];
  const hasData = stats.total > 0 || stats.pending > 0;
  const config = readBrainConfig();
  const isRemote = config.brainMode === "remote";

  const sections = status ? Object.keys(status) : [];
  const overall: "ok" | "warn" | "err" = status
    ? sections.every((k) => healthColor((status as any)[k]) === "ok") ? "ok" : sections.some((k) => healthColor((status as any)[k]) === "err") ? "err" : "warn"
    : error ? "err" : "warn";

  return (
    <PageLayout
      title="Status"
      description="Command insights — what Krishna heard, what succeeded, and what failed"
    >
      <>
        {/* Command Insights section — unchanged */}
        {!ciLoading && !hasData && (
          <Empty
            isLoading={ciLoading}
            icon={BarChart3Icon}
            title="No activity yet"
            description="Talk to Krishna and your command stats will show up here"
          />
        )}

        {!ciLoading && hasData && (
          <div className="mb-6 rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3Icon className="h-4 w-4" />
                Insights
              </h2>
              {confirmClear ? (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Clear all command stats? Your conversations are kept.</span>
                  <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={async () => { await clearCommandLog(); setConfirmClear(false); }}>Yes</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setConfirmClear(false)}>No</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>Clear command stats</Button>
              )}
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <div className="min-w-[84px] flex-1 rounded-lg border p-3 text-center">
                <p className="text-lg font-bold leading-tight">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="min-w-[84px] flex-1 rounded-lg border p-3 text-center">
                <p className="text-lg font-bold leading-tight text-green-600">{stats.answered}</p>
                <p className="text-xs text-muted-foreground">Answered</p>
              </div>
              <div className="min-w-[84px] flex-1 rounded-lg border p-3 text-center">
                <p className="text-lg font-bold leading-tight text-red-600">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="min-w-[84px] flex-1 rounded-lg border p-3 text-center">
                <p className="text-lg font-bold leading-tight text-orange-600">{stats.declined}</p>
                <p className="text-xs text-muted-foreground">Declined</p>
              </div>
              {stats.pending > 0 && (
                <div className="min-w-[84px] flex-1 rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold leading-tight text-amber-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">In progress</p>
                </div>
              )}
            </div>

            {stats.failed > 0 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Failure breakdown</p>
                {stats.byReason.slice(0, 5).map((r) => (
                  <div key={r.reason} className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-800 dark:bg-red-950">
                    <span className="font-medium text-red-700 dark:text-red-300">{FAILURE_LABELS[r.reason]}</span>
                    <Badge variant="outline" className="text-xs">{r.count}</Badge>
                  </div>
                ))}
              </div>
            )}

            {recent.length > 0 && (
              <div className="mb-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recent activity ({recent.length})</p>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {recent.map((entry) => {
                    const badge = STATUS_BADGE[entry.outcome] ?? STATUS_BADGE.failed;
                    return (
                      <div key={entry.id} className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs ${badge.bg}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {entry.outcome === "pending" ? <RefreshCwIcon className="h-3 w-3 animate-spin text-amber-500" />
                              : entry.outcome === "answered" ? <span className="h-2 w-2 rounded-full bg-green-500" />
                              : entry.outcome === "declined" ? <span className="h-2 w-2 rounded-full bg-orange-500" />
                              : <XCircleIcon className="h-3 w-3 text-red-500" />}
                            <span className="line-clamp-1 font-medium">{entry.transcript || "(empty)"}</span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{badge.label}{entry.failureReason && ` — ${FAILURE_LABELS[entry.failureReason] ?? entry.failureReason}`}</p>
                        </div>
                        <span className="shrink-0 text-muted-foreground">{moment(entry.createdAt).format("MMM D, h:mm A")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {topFailure && FAILURE_HINTS[topFailure.reason] && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <LightbulbIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{FAILURE_HINTS[topFailure.reason]}</span>
              </div>
            )}
          </div>
        )}

        {/* System Health section */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <DatabaseIcon className="h-4 w-4" />
              System Health
            </h2>
            {isRemote && (
              <>
                <Badge className={`text-xs ${badgeForColor(overall).bg} ${badgeForColor(overall).color}`}>
                  {badgeForColor(overall).label}
                </Badge>
                {lastCheckedAt && (
                  <span className="text-xs text-muted-foreground">{moment(lastCheckedAt).fromNow()}</span>
                )}
              </>
            )}
            {isRemote && (
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={refresh} disabled={healthLoading}>
                  <RefreshCwIcon className={`mr-1 h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={forceSync}>
                  <CloudIcon className="mr-1 h-3 w-3" />
                  Sync now
                </Button>
              </div>
            )}
          </div>

          {!isRemote && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <DatabaseIcon className="h-4 w-4 shrink-0" />
              <span>Connect to the brain (Remote mode) to see system health. Open Settings → Brain Connection.</span>
            </div>
          )}

          {isRemote && error && !status && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              <XCircleIcon className="h-4 w-4 shrink-0" />
              <span>Brain unreachable — {error}</span>
            </div>
          )}

          {isRemote && status && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HEALTH_CARDS.map(({ key, icon: Icon, label, detail }) => {
                const s = (status as any)[key];
                const c = healthColor(s);
                const badge = badgeForColor(c);
                return (
                  <div key={key} className={`rounded-md border p-3 ${badge.bg}`}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${badge.color}`} />
                      <span className="text-xs font-semibold">{label}</span>
                      <Badge className={`ml-auto text-xs ${badge.bg} ${badge.color}`}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{detail(s)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    </PageLayout>
  );
};

export default Status;
