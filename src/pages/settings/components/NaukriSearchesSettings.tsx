import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { invoke } from "@tauri-apps/api/core";
import {
  getAllSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
} from "@krishna/core/database/saved-searches.action";
import type { SavedSearch } from "@krishna/core/types/saved-search";
import { Plus, Trash2, AlertCircle, ExternalLink } from "lucide-react";

interface ChromeProfile {
  dir: string;
  name: string;
  instance: string;
}

const initialForm = {
  name: "",
  roleTag: "",
  url: "",
  chromeProfileDir: "",
  chromeProfileName: "",
  mode: "manual" as SavedSearch["mode"],
};

export const NaukriSearchesSettings = () => {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        getAllSavedSearches(),
        invoke<ChromeProfile[]>("list_chrome_profiles").catch(() => [] as ChromeProfile[]),
      ]);
      setSearches(s);
      setProfiles(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedProfile = profiles.find(
    (p) => p.dir === form.chromeProfileDir,
  );

  const handleAdd = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.url.trim()) { setError("URL is required"); return; }

    setSaving(true);
    try {
      const result = await createSavedSearch({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        roleTag: form.roleTag.trim(),
        url: form.url.trim(),
        chromeProfileDir: form.chromeProfileDir,
        chromeProfileName: selectedProfile?.name || form.chromeProfileName,
        mode: form.mode,
        resumePathOverride: null,
        created_at: Date.now(),
      });

      if (!result.ok) {
        setError(result.error);
      } else {
        setForm(initialForm);
        setAdding(false);
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save search");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedSearch(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete search");
    }
  };

  return (
    <div id="naukri-searches" className="space-y-3">
      <Header
        title="Job Searches"
        description="Saved Naukri/LinkedIn search URLs with Chrome profile bindings."
        isMainTitle
      />

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {searches.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {s.mode}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  {s.chromeProfileName && <span>{s.chromeProfileName}</span>}
                  {s.roleTag && <span>{s.roleTag}</span>}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-primary truncate max-w-[200px]"
                  >
                    {s.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(s.id)}
                title="Delete search"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Name</Label>
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="PM Mumbai belt"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Role Tag (optional)</Label>
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="program-manager"
              value={form.roleTag}
              onChange={(e) => setForm((f) => ({ ...f, roleTag: e.target.value }))}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Search URL</Label>
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://naukri.com/pm-mumbai-jobs"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Only naukri.com and linkedin.com URLs are allowed.
            </p>
          </div>

          <div>
            <Label className="text-sm font-medium">Chrome Profile</Label>
            {profiles.length > 0 ? (
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.chromeProfileDir}
                onChange={(e) => {
                  const p = profiles.find((pr) => pr.dir === e.target.value);
                  setForm((f) => ({
                    ...f,
                    chromeProfileDir: e.target.value,
                    chromeProfileName: p?.name || "",
                  }));
                }}
              >
                <option value="">— No profile (default) —</option>
                {profiles.map((p) => (
                  <option key={`${p.instance}-${p.dir}`} value={p.dir}>
                    {p.name} ({p.instance})
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No Chrome profiles found. Make sure Chrome has at least one profile.
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Mode</Label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.mode}
              onChange={(e) =>
                setForm((f) => ({ ...f, mode: e.target.value as SavedSearch["mode"] }))
              }
            >
              <option value="manual">Manual (normal Chrome)</option>
              <option value="assisted">Assisted (debug Chrome, N4 only)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? "Saving..." : "Add Search"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setAdding(false); setForm(initialForm); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!adding && !loading && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Add Search
        </Button>
      )}
    </div>
  );
};
