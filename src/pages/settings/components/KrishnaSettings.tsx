import { useState, useEffect } from "react";
import { Switch, Label, Header, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Slider, Button } from "@/components";
import { useKrishna } from "@/hooks";
import { useLearnedActions } from "@/hooks/useLearnedActions";
import { useMemories } from "@/hooks/useMemories";
import { useAudit } from "@/hooks/useAudit";
import { useReminders } from "@/hooks/useReminders";

export const KrishnaSettings = () => {
  const { enabled, setKrishnaEnabled, voice, setVoice, rate, setRate, llmFallbackEnabled, setLlmFallbackEnabled } = useKrishna();
  const { actions, isLoading, removeAction, clearAll } = useLearnedActions();
  const { memories, isLoading: memoriesLoading, removeMemory, clearAll: clearAllMemories } = useMemories();
  const { entries: auditEntries, isLoading: auditLoading, clearAll: clearAuditLog } = useAudit();
  const { reminders, isLoading: remindersLoading, toggleReminder, removeReminder, clearAll: clearAllReminders } = useReminders();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const enVoices = voices.filter((v) => v.lang.startsWith("en"));

  return (
    <div id="krishna" className="space-y-4">
      <Header
        title="Krishna Assistant"
        description="Voice-activated AI assistant — say 'Hey Krishna' followed by your command"
        isMainTitle
      />

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">Enable Krishna</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {enabled
                ? "Krishna listens for 'Hey Krishna' during system audio capture"
                : "Krishna is disabled"}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setKrishnaEnabled}
          aria-label="Toggle Krishna assistant"
        />
      </div>

      {/* Voice picker */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Voice</Label>
        <Select value={voice} onValueChange={setVoice}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Default voice" />
          </SelectTrigger>
          <SelectContent>
            {enVoices.map((v) => (
              <SelectItem key={v.name} value={v.name}>
                {v.name.replace("Microsoft ", "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rate slider */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-sm font-medium">Speech rate</Label>
          <span className="text-xs text-muted-foreground">{rate.toFixed(1)}x</span>
        </div>
        <Slider
          value={[rate]}
          onValueChange={([v]) => setRate(v)}
          min={0.5}
          max={2.0}
          step={0.1}
        />
      </div>

      {/* LLM fallback toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">LLM fallback for unknown apps</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Ask AI to guess the target when registry/Start Menu/PATH don't find it
          </p>
        </div>
        <Switch
          checked={llmFallbackEnabled}
          onCheckedChange={setLlmFallbackEnabled}
          aria-label="Toggle LLM fallback"
        />
      </div>

      {/* Memories list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Memories ({memories.length})</Label>
          {memories.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllMemories}>
              Forget all
            </Button>
          )}
        </div>
        {memoriesLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!memoriesLoading && memories.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No memories yet. Say "Hey Krishna, remember that my work folder is D:\Projects" to teach it.
          </p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{m.key || "memory"}</p>
              <p className="text-xs text-muted-foreground truncate">{m.value}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 shrink-0"
              onClick={() => removeMemory(m.id)}
            >
              Forget
            </Button>
          </div>
        ))}
      </div>

      {/* Reminders list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Reminders ({reminders.length})</Label>
          {reminders.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllReminders}>
              Clear all
            </Button>
          )}
        </div>
        {remindersLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!remindersLoading && reminders.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No reminders yet. Say "Hey Krishna, remind me to do something in 10 minutes."
          </p>
        )}
        {reminders.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.text}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.dueAt).toLocaleString()}
                {r.recurrence && (
                  <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                    {r.recurrence}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <Switch
                checked={r.enabled === 1}
                onCheckedChange={(v) => toggleReminder(r.id, v ? 1 : 0)}
                aria-label={"Toggle reminder " + r.text}
              />
              <Button variant="ghost" size="sm" onClick={() => removeReminder(r.id)}>
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit log list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Audit log ({auditEntries.length})</Label>
          {auditEntries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAuditLog}>
              Clear all
            </Button>
          )}
        </div>
        {auditLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!auditLoading && auditEntries.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No audit entries yet. Actions will be logged here as you use Krishna.
          </p>
        )}
        {auditEntries.map((e) => {
          const resultBadge = e.result === "ok"
            ? "bg-green-100 text-green-700"
            : e.result === "failed"
            ? "bg-red-100 text-red-700"
            : "bg-yellow-100 text-yellow-700";
          return (
            <div key={e.id} className="flex items-center justify-between rounded border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{e.actionType}</p>
                <p className="text-xs text-muted-foreground truncate">{e.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
              <span className={"ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + resultBadge}>
                {e.result}
              </span>
            </div>
          );
        })}
      </div>

      {/* Learned actions list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Learned actions ({actions.length})</Label>
          {actions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Forget all
            </Button>
          )}
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!isLoading && actions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No learned actions yet. Ask Krishna to open an app it hasn't seen before.
          </p>
        )}
        {actions.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{a.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{a.target}</p>
              <p className="text-xs text-muted-foreground">
                via {a.resolvedVia} &middot; {Math.round(a.confidence * 100)}% confidence
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 shrink-0"
              onClick={() => removeAction(a.id)}
            >
              Forget
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
