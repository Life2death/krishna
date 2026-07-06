import { useState, useEffect } from "react";
import { Switch, Label, Header, Button } from "@/components";
import { getAllLines, disableLine } from "@krishna/core/database";
import type { VoiceLineRow } from "@krishna/core/database";
import { Trash2, AlertCircle } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  filler_wait: "Filler (wait)",
  ack_quick: "Acknowledgement (quick)",
  ack_multistep: "Acknowledgement (multi-step)",
  confirm_yes_ack: "Confirmation acceptance",
  decline_ack: "Decline",
  reask: "Re-ask",
  error_generic: "Error (generic)",
  error_network: "Error (network)",
  reminder_intro: "Reminder intro",
  greeting: "Greeting",
  thanks_reply: "Thanks reply",
  wake_ack: "Wake acknowledgement",
};

const SOURCE_LABELS: Record<string, string> = {
  seed: "Built-in",
  owner: "You taught me",
  llm: "Learned",
};

const SOURCE_COLORS: Record<string, string> = {
  seed: "text-muted-foreground",
  owner: "text-primary",
  llm: "text-blue-500",
};

export const VoicePhrasesSettings = () => {
  const [lines, setLines] = useState<VoiceLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLines = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await getAllLines();
      setLines(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load phrases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLines();
  }, []);

  const handleToggle = async (id: string, currentEnabled: number) => {
    try {
      if (currentEnabled === 1) {
        await disableLine(id);
      } else {
        // Re-enable: set enabled=1 directly
        const { setDriver, getDatabase } = await import("@krishna/core/database/driver");
        const db = getDatabase();
        await db.execute("UPDATE voice_lines SET enabled = 1 WHERE id = ?", [id]);
      }
      await loadLines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update phrase");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { getDatabase } = await import("@krishna/core/database/driver");
      const db = getDatabase();
      await db.execute("DELETE FROM voice_lines WHERE id = ?", [id]);
      await loadLines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete phrase");
    }
  };

  const grouped = lines.reduce<Record<string, VoiceLineRow[]>>((acc, line) => {
    const key = line.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort();

  return (
    <div id="voice-phrases" className="space-y-3">
      <Header
        title="Voice & Phrases"
        description="View, enable, disable, or delete phrases Krishna uses"
        isMainTitle
      />

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading phrases...</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No phrases found.</p>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((cat) => (
            <div key={cat}>
              <h4 className="text-sm font-medium mb-2">
                {CATEGORY_LABELS[cat] || cat}
              </h4>
              <div className="space-y-2">
                {grouped[cat].map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-3 p-2 rounded-md border"
                  >
                    <Switch
                      checked={line.enabled === 1}
                      onCheckedChange={() => handleToggle(line.id, line.enabled)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${line.enabled ? "" : "text-muted-foreground line-through"}`}>
                        {line.text}
                      </p>
                      <div className="flex gap-2 text-xs">
                        <span className={SOURCE_COLORS[line.source] || "text-muted-foreground"}>
                          {SOURCE_LABELS[line.source] || line.source}
                        </span>
                        <span className="text-muted-foreground">
                          (weight: {line.weight})
                        </span>
                        {line.tod && (
                          <span className="text-muted-foreground">
                            {line.tod}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(line.id)}
                      title="Delete phrase"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
