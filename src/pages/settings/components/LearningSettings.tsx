import { useState, useEffect, useCallback } from "react";
import { Switch, Label, Header, Button } from "@/components";
import { useKrishna } from "@/hooks";
import {
  getStyleProfile,
  forgetStyleProfile,
  isPassiveLearningEnabled,
  setPassiveLearningEnabled,
} from "@/lib/learning";
import { Sparkles, Trash2, Loader2, RefreshCw } from "lucide-react";

export const LearningSettings = () => {
  const { forceStyleLearn } = useKrishna();
  const [enabled, setEnabled] = useState(true);
  const [profile, setProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [improving, setImproving] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getStyleProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEnabled(isPassiveLearningEnabled());
    void refreshProfile();
  }, [refreshProfile]);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    setPassiveLearningEnabled(checked);
  };

  const handleImproveNow = async () => {
    setImproving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await forceStyleLearn();
      await refreshProfile();
      setNotice(
        updated
          ? "Style profile updated."
          : "Not enough recent conversation yet — keep talking and try again.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setImproving(false);
    }
  };

  const handleForget = async () => {
    if (
      !window.confirm(
        "Forget what Krishna has learned about your communication style? It will re-learn from scratch.",
      )
    ) {
      return;
    }
    setForgetting(true);
    setError(null);
    setNotice(null);
    try {
      await forgetStyleProfile();
      await refreshProfile();
      setNotice("Learned style cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear profile");
    } finally {
      setForgetting(false);
    }
  };

  return (
    <div id="self-improvement" className="space-y-3">
      <Header
        title="Self-Improvement"
        description="Krishna quietly learns how you talk and mirrors your communication style. You can see, refresh, or forget what it has picked up."
        isMainTitle
      />

      <div className="space-y-3 rounded-lg border p-3">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">
              Learn my communication style passively
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, Krishna occasionally distills your recent messages
              into a short style profile. When off, it stops learning (existing
              profile is kept until you forget it).
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            aria-label="Toggle passive learning"
          />
        </div>

        {/* Current profile */}
        <div className="space-y-1.5 border-t border-border/10 pt-3">
          <Label className="text-sm font-medium">What Krishna has learned</Label>
          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : profile ? (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {profile}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              Krishna hasn't learned your communication style yet — keep talking
              and it will pick it up.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleImproveNow}
            disabled={improving || forgetting}
          >
            {improving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Improving…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" /> Improve now
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshProfile}
            disabled={improving || forgetting}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleForget}
            disabled={forgetting || improving || !profile}
            className="text-red-500 hover:text-red-600"
          >
            {forgetting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Forgetting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-1" /> Forget
              </>
            )}
          </Button>
        </div>

        {notice && <p className="text-xs text-green-600">{notice}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
};
