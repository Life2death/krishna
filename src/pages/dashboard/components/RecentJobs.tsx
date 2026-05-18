import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts";
import {
  getJobHistory,
  groupJobHistoryByDay,
  recordJobClick,
  removeJobHistoryEntry,
  getAllProfiles,
} from "@/lib";
import { InterviewProfile, JobHistoryEntry } from "@/types";
import {
  BriefcaseIcon,
  CheckCheckIcon,
  CheckIcon,
  ExternalLinkIcon,
  HistoryIcon,
  XIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components";

const RecentJobs = () => {
  const navigate = useNavigate();
  const { activeProfileId } = useApp();
  const [entries, setEntries] = useState<JobHistoryEntry[]>([]);
  const [profiles, setProfiles] = useState<InterviewProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | "all">(
    "all"
  );

  useEffect(() => {
    getAllProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    if (activeProfileId) setSelectedProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    const refresh = () => {
      setEntries(
        selectedProfileId === "all"
          ? getJobHistory()
          : getJobHistory(selectedProfileId)
      );
    };
    refresh();
    // Refresh when window regains focus (user might have come back from a job page)
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [selectedProfileId]);

  const groups = useMemo(() => groupJobHistoryByDay(entries), [entries]);
  const clickedCount = entries.filter((e) => e.clickedAt).length;

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
      prev.filter((x) => !(x.url === e.url && x.profileId === e.profileId))
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <BriefcaseIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Recent Job Activity
              {entries.length > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground">
                  {entries.length} seen · {clickedCount} opened
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              Jobs you've viewed in the last 7 days. Older entries auto-delete.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {profiles.length > 1 && (
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="h-7 text-[11px] px-2 rounded-md border border-border bg-card"
            >
              <option value="all">All profiles</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {activeProfileId && selectedProfileId !== "all" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() =>
                navigate(`/profiles/${selectedProfileId}/jobs`)
              }
            >
              Find more
            </Button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
          <HistoryIcon className="h-5 w-5 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            No jobs viewed yet. Go to{" "}
            <button
              className="text-primary underline"
              onClick={() => navigate("/profiles")}
            >
              Interview Profiles
            </button>{" "}
            and click "Find Jobs" on any profile to start.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground/80 px-1">
                {group.label}
              </p>
              <div className="rounded-lg border border-border divide-y divide-border/60">
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
                      <div
                        className="pt-0.5 flex-shrink-0"
                        title={isClicked ? "Opened" : "Seen"}
                      >
                        {isClicked ? (
                          <CheckCheckIcon className="h-3.5 w-3.5 text-blue-500" />
                        ) : (
                          <CheckIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </div>

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
                          {selectedProfileId === "all" && (
                            <>
                              <span>·</span>
                              <span className="italic">{e.profileName}</span>
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
      )}
    </div>
  );
};

export default RecentJobs;
