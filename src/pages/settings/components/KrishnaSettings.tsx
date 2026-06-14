import { useState, useEffect } from "react";
import {
  Switch,
  Label,
  Header,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Slider,
  Button,
} from "@/components";
import { useKrishna } from "@/hooks";
import { useLearnedActions } from "@/hooks/useLearnedActions";
import { useMemories } from "@/hooks/useMemories";
import { useAudit } from "@/hooks/useAudit";
import { useReminders } from "@/hooks/useReminders";
import { getElevenLabsTTS } from "@/lib/tts";
import type { ElevenLabsVoice } from "@/lib/tts";

const EL_MODELS = [
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 — fastest, best for free tier" },
  { id: "eleven_turbo_v2", label: "Turbo v2 — slightly older turbo" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — higher quality, slower" },
  { id: "eleven_monolingual_v1", label: "Monolingual v1 — English only, legacy" },
];

export const KrishnaSettings = () => {
  const {
    enabled, setKrishnaEnabled,
    voice, setVoice,
    rate, setRate,
    llmFallbackEnabled, setLlmFallbackEnabled,
    ttsProvider, setTtsProvider,
    elApiKey, setElApiKey,
    elVoiceId, setElVoiceId,
    elVoiceName, setElVoiceName,
    elModelId, setElModelId,
  } = useKrishna();

  const { actions, isLoading, removeAction, clearAll } = useLearnedActions();
  const { memories, isLoading: memoriesLoading, removeMemory, clearAll: clearAllMemories } = useMemories();
  const { entries: auditEntries, isLoading: auditLoading, clearAll: clearAuditLog } = useAudit();
  const { reminders, isLoading: remindersLoading, toggleReminder, removeReminder, clearAll: clearAllReminders } = useReminders();

  // Browser voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const enVoices = voices.filter((v) => v.lang.startsWith("en"));

  // ElevenLabs voices
  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>([]);
  const [elFetching, setElFetching] = useState(false);
  const [elFetchError, setElFetchError] = useState("");
  const [elKeyInput, setElKeyInput] = useState(elApiKey);

  const fetchElVoices = async () => {
    if (!elKeyInput.trim()) { setElFetchError("Enter your API key first."); return; }
    setElFetching(true);
    setElFetchError("");
    try {
      const el = getElevenLabsTTS();
      el.configure({ apiKey: elKeyInput.trim() });
      const list = await el.fetchVoices();
      setElVoices(list);
      setElApiKey(elKeyInput.trim());
    } catch (e) {
      setElFetchError(e instanceof Error ? e.message : "Failed to fetch voices");
    } finally {
      setElFetching(false);
    }
  };

  const previewElVoice = (v: ElevenLabsVoice) => {
    if (v.preview_url) {
      const audio = new Audio(v.preview_url);
      audio.play().catch(() => {});
    }
  };

  return (
    <div id="krishna" className="space-y-4">
      <Header
        title="Krishna Assistant"
        description="Voice-activated AI assistant — speak naturally to interact"
        isMainTitle
      />

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Enable Krishna</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {enabled ? "Krishna listens via your microphone" : "Krishna is disabled"}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setKrishnaEnabled} />
      </div>

      {/* TTS Provider */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Voice output</Label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={ttsProvider === "browser" ? "default" : "outline"}
            onClick={() => setTtsProvider("browser")}
          >
            Browser voice
          </Button>
          <Button
            size="sm"
            variant={ttsProvider === "elevenlabs" ? "default" : "outline"}
            onClick={() => setTtsProvider("elevenlabs")}
          >
            ElevenLabs
          </Button>
        </div>
      </div>

      {/* Browser voice picker */}
      {ttsProvider === "browser" && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Browser voice</Label>
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
            <p className="text-xs text-muted-foreground">
              Best options on Windows: Aria Online (Natural), Jenny Online (Natural), Guy Online (Natural)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">Speech rate</Label>
              <span className="text-xs text-muted-foreground">{rate.toFixed(1)}x</span>
            </div>
            <Slider value={[rate]} onValueChange={([v]) => setRate(v)} min={0.5} max={2.0} step={0.1} />
          </div>
        </>
      )}

      {/* ElevenLabs settings */}
      {ttsProvider === "elevenlabs" && (
        <div className="space-y-4 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">API Key</Label>
            <div className="flex gap-2">
              <input
                type="password"
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="sk_..."
                value={elKeyInput}
                onChange={(e) => setElKeyInput(e.target.value)}
                onBlur={() => {
                  if (elKeyInput.trim()) setElApiKey(elKeyInput.trim());
                }}
              />
              <Button size="sm" onClick={fetchElVoices} disabled={elFetching}>
                {elFetching ? "Loading…" : "Fetch voices"}
              </Button>
            </div>
            {elFetchError && (
              <p className="text-xs text-red-500">{elFetchError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Model</Label>
            <Select value={elModelId} onValueChange={setElModelId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EL_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected voice display */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Voice</Label>
              <span className="text-xs text-muted-foreground">
                {elVoiceName} — {elVoiceId.slice(0, 8)}…
              </span>
            </div>

            {elVoices.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {elVoices.map((v) => (
                  <div
                    key={v.voice_id}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted ${
                      elVoiceId === v.voice_id ? "bg-primary/10" : ""
                    }`}
                    onClick={() => {
                      setElVoiceId(v.voice_id);
                      setElVoiceName(v.name);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {v.name}
                        {elVoiceId === v.voice_id && (
                          <span className="ml-2 text-xs text-primary">✓ selected</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.category}
                        {v.labels?.gender ? ` · ${v.labels.gender}` : ""}
                        {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                        {v.labels?.age ? ` · ${v.labels.age}` : ""}
                      </p>
                    </div>
                    {v.preview_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs shrink-0 ml-2"
                        onClick={(e) => { e.stopPropagation(); previewElVoice(v); }}
                      >
                        ▶ Preview
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enter your API key and click "Fetch voices" to see available voices.
              </p>
            )}
          </div>
        </div>
      )}

      {/* LLM fallback toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">LLM fallback for unknown apps</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Ask AI to guess the target when registry/Start Menu/PATH don't find it
          </p>
        </div>
        <Switch checked={llmFallbackEnabled} onCheckedChange={setLlmFallbackEnabled} />
      </div>

      {/* Memories list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Memories ({memories.length})</Label>
          {memories.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllMemories}>Forget all</Button>
          )}
        </div>
        {memoriesLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!memoriesLoading && memories.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No memories yet. Say "Krishna, remember that my work folder is D:\Projects".
          </p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{m.key || "memory"}</p>
              <p className="text-xs text-muted-foreground truncate">{m.value}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-2 shrink-0" onClick={() => removeMemory(m.id)}>
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
            <Button variant="ghost" size="sm" onClick={clearAllReminders}>Clear all</Button>
          )}
        </div>
        {remindersLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!remindersLoading && reminders.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No reminders yet. Say "Krishna, remind me to do something in 10 minutes."
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
              />
              <Button variant="ghost" size="sm" onClick={() => removeReminder(r.id)}>Cancel</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit log */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Audit log ({auditEntries.length})</Label>
          {auditEntries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAuditLog}>Clear all</Button>
          )}
        </div>
        {auditLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!auditLoading && auditEntries.length === 0 && (
          <p className="text-xs text-muted-foreground">No audit entries yet.</p>
        )}
        {auditEntries.map((e) => {
          const badge =
            e.result === "ok" ? "bg-green-100 text-green-700" :
            e.result === "failed" ? "bg-red-100 text-red-700" :
            "bg-yellow-100 text-yellow-700";
          return (
            <div key={e.id} className="flex items-center justify-between rounded border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{e.actionType}</p>
                <p className="text-xs text-muted-foreground truncate">{e.summary}</p>
                <p className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</p>
              </div>
              <span className={"ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + badge}>
                {e.result}
              </span>
            </div>
          );
        })}
      </div>

      {/* Learned actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Learned actions ({actions.length})</Label>
          {actions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>Forget all</Button>
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
            <Button variant="ghost" size="sm" className="ml-2 shrink-0" onClick={() => removeAction(a.id)}>
              Forget
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
