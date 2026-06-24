import { Badge, Input, Card, Empty, Button } from "@/components";
import { useHistory, useCommandInsights } from "@/hooks";
import { PageLayout } from "@/layouts";
import { deleteAllConversations } from "@/lib/database";
import { MessageCircleIcon, Search, Trash2, XCircleIcon, BarChart3Icon, LightbulbIcon, RefreshCwIcon, ClockIcon } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import type { FailureReason, CommandLogEntry } from "@/lib/database";

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

const Dashboard = () => {
  const conversations = useHistory();
  const { stats, recent, isLoading: statsLoading, clearAll: clearCommandLog } = useCommandInsights();
  const navigate = useNavigate();

  const groupedConversations = conversations.conversations.reduce(
    (acc, doc) => {
      const dateKey = moment(doc.updatedAt).format("YYYY-MM-DD");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(doc);
      return acc;
    },
    {} as Record<string, typeof conversations.conversations>
  );

  const sortedDates = Object.keys(groupedConversations).sort((a, b) =>
    moment(b).diff(moment(a))
  );

  const handleClearAll = async () => {
    await deleteAllConversations();
    conversations.refreshConversations();
  };

  const topFailure = stats.byReason[0];

  return (
    <PageLayout
      title="Dashboard"
      description="Krishna — your AI voice assistant"
    >
      <>
        {/* Insights section */}
        {!statsLoading && (stats.total > 0 || stats.pending > 0) && (
          <div className="mb-6 rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3Icon className="h-4 w-4" />
                Insights
              </h2>
              <Button variant="ghost" size="sm" onClick={clearCommandLog}>
                Clear stats
              </Button>
            </div>

            {/* Stat cards */}
            <div className="mb-3 grid grid-cols-5 gap-2">
              <Card className="p-3 text-center shadow-none">
                <p className="text-lg font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </Card>
              <Card className="p-3 text-center shadow-none">
                <p className="text-lg font-bold text-green-600">{stats.answered}</p>
                <p className="text-xs text-muted-foreground">Answered</p>
              </Card>
              <Card className="p-3 text-center shadow-none">
                <p className="text-lg font-bold text-red-600">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </Card>
              <Card className="p-3 text-center shadow-none">
                <p className="text-lg font-bold text-orange-600">{stats.declined}</p>
                <p className="text-xs text-muted-foreground">Declined</p>
              </Card>
              {stats.pending > 0 && (
                <Card className="p-3 text-center shadow-none">
                  <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">In progress</p>
                </Card>
              )}
            </div>

            {/* Failures list */}
            {stats.failed > 0 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Failure breakdown</p>
                {stats.byReason.slice(0, 5).map((r) => (
                  <div
                    key={r.reason}
                    className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-800 dark:bg-red-950"
                  >
                    <span className="font-medium text-red-700 dark:text-red-300">
                      {FAILURE_LABELS[r.reason]}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {r.count}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Recent activity — all outcomes, live */}
            {recent.length > 0 && (
              <div className="mb-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Recent activity ({recent.length})
                </p>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {recent.map((entry) => {
                    const badge = STATUS_BADGE[entry.outcome] ?? STATUS_BADGE.failed;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs ${badge.bg}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {entry.outcome === "pending" ? (
                              <RefreshCwIcon className="h-3 w-3 animate-spin text-amber-500" />
                            ) : entry.outcome === "answered" ? (
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                            ) : entry.outcome === "declined" ? (
                              <span className="h-2 w-2 rounded-full bg-orange-500" />
                            ) : (
                              <XCircleIcon className="h-3 w-3 text-red-500" />
                            )}
                            <span className="truncate font-medium">
                              {entry.transcript || "(empty)"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">
                            {badge.label}
                            {entry.failureReason && ` — ${FAILURE_LABELS[entry.failureReason] ?? entry.failureReason}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-muted-foreground">
                          {moment(entry.createdAt).format("MMM D, h:mm A")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actionable hint */}
            {topFailure && FAILURE_HINTS[topFailure.reason] && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <LightbulbIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{FAILURE_HINTS[topFailure.reason]}</span>
              </div>
            )}
          </div>
        )}

        {conversations.conversations.length === 0 ? (
          <Empty
            isLoading={conversations.isLoading}
            icon={MessageCircleIcon}
            title="No conversations found"
            description="Start a new conversation to get started"
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <div className="flex items-center justify-between">
              <div className="relative w-1/3">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={conversations.search}
                  onChange={(e) => conversations.setSearch(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                Clear all
              </Button>
            </div>
            {sortedDates
              .filter((dateKey) =>
                conversations?.search?.length === 0
                  ? true
                  : groupedConversations?.[dateKey]?.some((doc) =>
                      doc?.title
                        .toLowerCase()
                        .includes(conversations?.search?.toLowerCase() || "")
                    )
              )
              .map((dateKey) => (
                <div key={dateKey} className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground select-none font-medium">
                    {moment(dateKey).format("ddd, MMM D")}
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((doc) => (
                      <Card
                        key={doc.id}
                        className="shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer"
                        onClick={() => navigate(`/chats/view/${doc.id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="line-clamp-1 text-sm mr-8">
                            {doc.title}
                          </p>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.messages.length} messages
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {moment(doc.updatedAt).format("hh:mm A")}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-1">
                          {conversations.deleteConfirm === doc.id ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">Delete?</span>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); conversations.confirmDelete(); }}
                              >
                                Yes
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); conversations.cancelDelete(); }}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); conversations.handleDeleteConfirm(doc.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </>
    </PageLayout>
  );
};

export default Dashboard;
