import { useState, useEffect } from "react";
import { Switch, Label, Header, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Slider, Button } from "@/components";
import { useKrishna } from "@/hooks";
import { useLearnedActions } from "@/hooks/useLearnedActions";
import { useMemories } from "@/hooks/useMemories";

export const KrishnaSettings = () => {
  const { enabled, setKrishnaEnabled, voice, setVoice, rate, setRate, llmFallbackEnabled, setLlmFallbackEnabled } = useKrishna();
  const { actions, isLoading, removeAction, clearAll } = useLearnedActions();
  const { memories, isLoading: memoriesLoading, removeMemory, clearAll: clearAllMemories } = useMemories();
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
