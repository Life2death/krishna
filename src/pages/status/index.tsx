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

const Status = () => {
  const { stats, recent, isLoading: ciLoading, clearAll: clearCommandLog } = useCommandInsights();
  const { status, isLoading: healthLoading, refresh } = useSystemHealth();
  const [confirmClear, setConfirmClear] = useState(false);
  const topFailure = stats.byReason[0];
  const hasData = stats.total > 0 || stats.pending > 0;

  return (
    <PageLayout
      title="Status"
      description="Command insights — what Krishna heard, what succeeded, and what failed"
    >
      <>
        {/* Command Insights section */}
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
            <div className="ml-auto">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={refresh} disabled={healthLoading}>
                <RefreshCwIcon className={`mr-1 h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {status && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <BrainCircuitIcon className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold">Brain</span>
                  <Badge className="ml-auto text-xs bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300">OK</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Local mode — no brain process</p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <CloudIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold">Cloud Sync</span>
                  <Badge className="ml-auto text-xs bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">Disabled</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Local only — not syncing to cloud</p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <MailIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold">Gmail</span>
                  <Badge className="ml-auto text-xs bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">Disabled</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Not configured</p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <SearchIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold">RAG</span>
                  <Badge className="ml-auto text-xs bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">Disabled</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Local mode only</p>
              </div>
              <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <CpuIcon className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold">AI Provider</span>
                  <Badge className="ml-auto text-xs bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300">Local</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Configured in AI Provider settings</p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <PuzzleIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold">MCP Tools</span>
                  <Badge className="ml-auto text-xs bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">0</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Client-side MCP deferred to Phase 4</p>
              </div>
              <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                <div className="mb-1 flex items-center gap-1.5">
                  <HardDriveIcon className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold">Data</span>
                  <Badge className="ml-auto text-xs bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300">OK</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {status.data.memories ?? "?"} memories &middot; {status.data.conversations ?? "?"} conversations (local DB)
                </p>
              </div>
            </div>
          )}

          {!status && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <DatabaseIcon className="h-4 w-4 shrink-0" />
              <span>Loading system health from local database…</span>
            </div>
          )}
        </div>
      </>
    </PageLayout>
  );
};

export default Status;
