import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveIcon, ClipboardListIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { Button, Header, Input, Textarea, Badge } from "@/components";
import {
  archiveUpgradeTask,
  createUpgradeTask,
  listUpgradeEvents,
  listUpgradeRuns,
  listUpgradeTasks,
  updateUpgradeTask,
} from "@/lib/database";
import { isMobileDevice } from "@/lib/platform";
import type { UpgradeEvent, UpgradeProviderPolicy, UpgradeRun, UpgradeTask } from "@krishna/core/types";

function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function providerLabel(policy: UpgradeProviderPolicy): string {
  if (policy === "codex") return "Codex";
  if (policy === "claude") return "Claude";
  return "Codex + Claude";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export default function UpgradesPage({ embedded = false }: { embedded?: boolean }) {
  const [tasks, setTasks] = useState<UpgradeTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<UpgradeEvent[]>([]);
  const [runs, setRuns] = useState<UpgradeRun[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [area, setArea] = useState("Self-improvement");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null,
    [selectedId, tasks],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await listUpgradeTasks({ query, includeArchived });
      setTasks(rows);
      if (rows.length > 0 && !rows.some((task) => task.id === selectedId)) {
        setSelectedId(rows[0].id);
      }
      if (rows.length === 0) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load upgrades");
    }
  }, [includeArchived, query, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setRuns([]);
      return;
    }
    void (async () => {
      setEvents(await listUpgradeEvents(selected.id));
      setRuns(await listUpgradeRuns(selected.id));
    })();
  }, [selected]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const text = requestText.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const task = await createUpgradeTask({
        requestText: text,
        area: area.trim() || "Self-improvement",
        source: "manual",
        platform: isMobileDevice() ? "android" : "desktop",
        acceptanceCriteria: [
          "A user can review this task locally before any provider is called.",
          "No implementation, merge, release, or install happens without explicit approval.",
        ],
      });
      setRequestText("");
      setSelectedId(task.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create upgrade");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (task: UpgradeTask) => {
    if (!window.confirm(`Archive "${task.title}"?`)) return;
    await archiveUpgradeTask(task.id);
    await refresh();
  };

  const handlePriority = async (task: UpgradeTask, priority: UpgradeTask["priority"]) => {
    await updateUpgradeTask(task.id, { priority });
    await refresh();
  };

  const content = (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-border/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <Header
            title="New Upgrade"
            description="Capture a local self-improvement task. Provider analysis starts in a later stage."
          />
          <Badge variant="outline">Local only</Badge>
        </div>
        <Textarea
          value={requestText}
          onChange={(event) => setRequestText(event.target.value)}
          placeholder="Improve yourself so you can zoom maps and images by voice"
          className="min-h-24"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Area" className="sm:max-w-xs" />
          <Button type="submit" disabled={saving || !requestText.trim()} className="sm:w-auto">
            <PlusIcon className="size-4" />
            Add Task
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter upgrades" className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setIncludeArchived((v) => !v)}>
            {includeArchived ? "Hide Archived" : "Show Archived"}
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Refresh upgrades" onClick={() => void refresh()}>
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
              No upgrade tasks yet.
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedId(task.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selected?.id === task.id ? "border-primary/70 bg-primary/5" : "border-border/40 hover:bg-accent/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.requestText}</p>
                  </div>
                  <Badge variant={task.status === "archived" ? "secondary" : "outline"}>{statusLabel(task.status)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{task.area}</span>
                  <span>{task.priority}</span>
                  <span>{providerLabel(task.providerPolicy)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="min-h-80 rounded-lg border border-border/40 p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ClipboardListIcon className="size-5 text-primary" />
                    <h2 className="text-lg font-semibold">{selected.title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{selected.normalizedGoal}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleArchive(selected)}>
                  <ArchiveIcon className="size-4" />
                  Archive
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/30 p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium capitalize">{statusLabel(selected.status)}</p>
                </div>
                <div className="rounded-lg border border-border/30 p-3">
                  <p className="text-xs text-muted-foreground">Providers</p>
                  <p className="text-sm font-medium">{providerLabel(selected.providerPolicy)}</p>
                </div>
                <div className="rounded-lg border border-border/30 p-3">
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <select
                    value={selected.priority}
                    onChange={(event) => void handlePriority(selected, event.target.value as UpgradeTask["priority"])}
                    className="mt-1 w-full rounded border border-border/30 bg-background px-2 py-1 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Acceptance Criteria</h3>
                {parseList(selected.acceptanceCriteriaJson).length > 0 ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {parseList(selected.acceptanceCriteriaJson).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No acceptance criteria yet.</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Provider Runs</h3>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No provider or GitHub calls in Stage 1.</p>
                ) : (
                  runs.map((run) => <p key={run.id} className="text-sm">{run.provider}: {run.status}</p>)
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">History</h3>
                <div className="space-y-2">
                  {events.map((event) => (
                    <div key={event.id} className="rounded border border-border/30 p-2 text-xs">
                      <div className="font-medium">{statusLabel(event.eventType)}</div>
                      {event.note && <div className="text-muted-foreground">{event.note}</div>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
              Select or create an upgrade task.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="flex flex-1 flex-col px-1">
      <Header
        title="Upgrades"
        description="Local self-improvement task queue and approval surface"
        isMainTitle
        showBorder
      />
      <div className="py-4">{content}</div>
    </div>
  );
}
