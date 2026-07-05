import { useState, useEffect } from "react";
import { Label, Header, Button } from "@/components";
import { getMemoryByKey, createMemory } from "@/lib/repo-bound";
import type { ApplicationProfile } from "@/types";
import { defaultProfile, PROFILE_STORAGE_KEY } from "@/types";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export const ApplicationProfileSettings = () => {
  const [profile, setProfile] = useState<ApplicationProfile>(defaultProfile);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemoryByKey(PROFILE_STORAGE_KEY).then((mem) => {
      if (mem) {
        try {
          const p = JSON.parse(mem.value) as ApplicationProfile;
          setProfile(p);
          if (p.resumePath) {
            invoke<boolean>("file_exists", { path: p.resumePath }).then((exists) => {
              if (!exists) setFileWarning("Resume file not found at the saved path.");
              else setFileWarning(null);
            });
          }
        } catch {
          // corrupted — start fresh
        }
      }
      setLoaded(true);
    });
  }, []);

  const handleBrowseResume = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selected) {
        setProfile((prev) => ({ ...prev, resumePath: selected }));
        setFileWarning(null);
      }
    } catch {
      // User cancelled or dialog failed — no-op
    }
  };

  const handleSave = async () => {
    setError(null);
    try {
      const now = Date.now();
      await createMemory({
        id: String(now),
        key: PROFILE_STORAGE_KEY,
        value: JSON.stringify(profile),
        source: "settings",
        confirmed: 1,
        createdAt: now,
        lastUsedAt: null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    }
  };

  const update = (field: keyof ApplicationProfile, value: string | boolean) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div id="application-profile" className="space-y-3">
      <Header
        title="Application Profile"
        description="Your personal details for auto-filling job applications."
        isMainTitle
      />

      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <Label className="text-sm font-medium">Full Name</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Vikram Rao"
            value={profile.fullName}
            onChange={(e) => update("fullName", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Email</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="vikram@example.com"
            value={profile.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Phone</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="+91-9876543210"
            value={profile.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Current Location</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Bangalore, India"
            value={profile.currentLocation}
            onChange={(e) => update("currentLocation", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Notice Period</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="30 days"
            value={profile.noticePeriod}
            onChange={(e) => update("noticePeriod", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Current CTC</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="₹12,00,000"
            value={profile.currentCtc}
            onChange={(e) => update("currentCtc", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Expected CTC</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="₹18,00,000"
            value={profile.expectedCtc}
            onChange={(e) => update("expectedCtc", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Years of Experience</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="8"
            value={profile.yearsOfExperience}
            onChange={(e) => update("yearsOfExperience", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Resume Path (local PDF)</Label>
          <div className="mt-1 flex gap-2">
            <input
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="C:\Users\vikra\Documents\resume.pdf"
              value={profile.resumePath}
              onChange={(e) => { update("resumePath", e.target.value); setFileWarning(null); }}
            />
            <Button size="sm" onClick={handleBrowseResume} type="button">Browse...</Button>
          </div>
          {fileWarning && <p className="mt-1 text-xs text-amber-500">{fileWarning}</p>}
        </div>

        <div>
          <Label className="text-sm font-medium">LinkedIn URL</Label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://linkedin.com/in/vikramrao"
            value={profile.linkedInUrl}
            onChange={(e) => update("linkedInUrl", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Why This Role (canned answer)</Label>
          <textarea
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder="I am excited about this role because..."
            value={profile.whyThisRole}
            onChange={(e) => update("whyThisRole", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="relocationOk"
            checked={profile.relocationOk}
            onChange={(e) => update("relocationOk", e.target.checked)}
          />
          <Label htmlFor="relocationOk" className="text-sm font-medium">
            Willing to relocate
          </Label>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={!loaded}>
            {saved ? "Saved" : "Save Profile"}
          </Button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};
