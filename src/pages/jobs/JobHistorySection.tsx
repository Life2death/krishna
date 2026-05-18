import { useEffect, useState } from "react";
import {
  CheckIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
  HistoryIcon,
  XIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getJobHistory,
  groupJobHistoryByDay,
  recordJobClick,
  removeJobHistoryEntry,
} from "@/lib";
import { JobHistoryEntry } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  /** When provided, only history for this profile is shown. */
  profileId?: string;
  /** Optional title override; defaults to "Recently viewed". */
  title?: string;
  /** Refresh trigger — pass a number that changes to re-read storage. */
  refreshKey?: number;
  /** Compact mode hides the "Today/Yesterday" date headers for narrow views. */
  compact?: boolean;
  /** Max rows to display total. */
  limit?: number;
}

export const JobHistorySection = ({
  profileId,
  title = "Recently viewed",
  refreshKey = 0,
  compact = false,
  limit,
}: Props) => {
  const [entries, setEntries] = useState<JobHistoryEntry[]>([]);

  useEffect(() => {
    const all = getJobHistory(profileId);
    setEntries(limit ? all.slice(0, limit) : all);
  }, [profileId, refreshKey, limit]);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
        <HistoryIcon className="h-5 w-5 mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-xs text-muted-foreground">
          No recent job activity. Search for jobs and the results will appear
          here for the next 7 days.
        </p>
      </div>
    );
  }

  const groups = groupJobHistoryByDay(entries);

  const handleOpen = async (e: JobHistoryEntry) => {
    if (!e.url) return;
    recordJobClick(e.url, e.profileId);
    setEntries((prev) =>
      prev.map((x) =>
        x.url === e.url && x.profileId === e.profileId
          ? { ...x, clickedAt: Date.now() }
          : x
      )
    );
    try {
      await openUrl(e.url);
    } catch {}
  };

  const handleRemove = (e: JobHistoryEntry) => {
    removeJobHistoryEntry(e.url, e.profileId);
    setEntries((prev) =>
      prev.filter(
        (x) => !(x.url === e.url && x.profileId === e.profileId)
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <HistoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground/70">
          Auto-deletes after 7 days · {entries.length} item
          {entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            {!compact && (
              <p className="text-[10px] font-medium text-muted-foreground/80 px-1">
                {group.label}
              </p>
            )}
            <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
              {group.entries.map((e) => {
                const isClicked = !!e.clickedAt;
                return (
                  <div
                    key={`${e.profileId}-${e.url}`}
                    className={cn(
                      "group flex items-start gap-2 px-3 py-2 hover:bg-muted/40 transition-colors",
                      isClicked && "opacity-80"
                    )}
                  >
                    {/* Tick column */}
                    <div className="pt-0.5 flex-shrink-0" title={isClicked ? "Opened" : "Seen"}>
                      {isClicked ? (
                        <CheckCheckIcon className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <CheckIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </div>

                    {/* Content */}
                    <button
                      type="button"
                      onClick={() => handleOpen(e)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p
                        className={cn(
                          "text-xs font-medium leading-snug truncate",
                          isClicked && "text-muted-foreground"
                        )}
                      >
                        {e.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        {e.company && (
                          <span className="truncate">{e.company}</span>
                        )}
                        {e.location && (
                          <>
                            <span>·</span>
                            <span className="truncate">{e.location}</span>
                          </>
                        )}
                        {e.via && (
                          <>
                            <span>·</span>
                            <span>{e.via}</span>
                          </>
                        )}
                        {typeof e.matchScore === "number" && (
                          <>
                            <span>·</span>
                            <span className="font-semibold tabular-nums">
                              {e.matchScore}%
                            </span>
                          </>
                        )}
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpen(e)}
                        title="Open job"
                        className="rounded p-1 hover:bg-accent"
                      >
                        <ExternalLinkIcon className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(e)}
                        title="Remove from history"
                        className="rounded p-1 hover:bg-accent"
                      >
                        <XIcon className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
