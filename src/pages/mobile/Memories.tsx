import { useState, useEffect, useCallback } from "react";
import { getRepo } from "@/lib/repo-selector";
import { useBrainWs } from "@/hooks/useBrainWs";
import { Button } from "@/components";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, BrainCircuit, RefreshCw } from "lucide-react";
import type { Memory } from "@/types";

export default function MobileMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const all = await getRepo().memories.getAllMemories();
      setMemories(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, []);

  useBrainWs("memories", load);

  useEffect(() => { load(); }, [load]);

  const addMemory = async () => {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) return;
    setSaving(true);
    setError(null);
    try {
      const mem: Memory = {
        id: crypto.randomUUID(),
        key,
        value,
        source: "manual",
        confirmed: 1,
        createdAt: Date.now(),
        lastUsedAt: null,
      };
      await getRepo().memories.createMemory(mem);
      setNewKey("");
      setNewValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add memory");
    } finally {
      setSaving(false);
    }
  };

  const removeMemory = async (id: string) => {
    try {
      await getRepo().memories.deleteMemory(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove memory");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <BrainCircuit className="size-5" />
          Memories
        </h1>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* New memory form */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <Input
          placeholder="Key (e.g., my email)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <Input
          placeholder="Value (e.g., user@example.com)"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <Button size="sm" onClick={addMemory} disabled={saving || !newKey.trim() || !newValue.trim()}>
          <Plus className="size-4 mr-1" />
          {saving ? "Saving..." : "Add Memory"}
        </Button>
      </div>

      {/* Memory list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : memories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No memories yet</p>
          ) : (
            memories.map((mem) => (
              <div
                key={mem.id}
                className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{mem.key}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{mem.value}</p>
                </div>
                <button
                  onClick={() => removeMemory(mem.id)}
                  className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
