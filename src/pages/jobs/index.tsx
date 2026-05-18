import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button, Input } from "@/components";
import { PageLayout } from "@/layouts";
import { useApp } from "@/contexts";
import {
  searchJobs,
  buildJobQuery,
  scoreJobWithAI,
  getJobProviderConfig,
  getProfileById,
  extractTopSkills,
  extractSkillsWithAI,
  filterJobsByAge,
  recordJobView,
  recordJobClick,
  getSavedJobSkills,
  setSavedJobSkills,
  getJobHistory,
} from "@/lib";
import { InterviewProfile, JobListing } from "@/types";
import { JOB_MAX_AGE_DAYS } from "@/config";
import {
  BriefcaseIcon,
  SearchIcon,
  Loader2Icon,
  ExternalLinkIcon,
  SparklesIcon,
  MapPinIcon,
  CalendarIcon,
  BuildingIcon,
  AlertCircleIcon,
  SettingsIcon,
  XIcon,
  PlusIcon,
  ArrowLeftIcon,
  SaveIcon,
  CheckCheckIcon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { JobHistorySection } from "./JobHistorySection";

const ScoreBadge = ({
  score,
  isScoring,
}: {
  score?: number;
  isScoring?: boolean;
}) => {
  if (isScoring) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="h-3 w-3 animate-spin" />
        Scoring…
      </div>
    );
  }
  if (score === undefined) return null;

  const label =
    score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Low";
  const barColor =
    score >= 85
      ? "bg-green-500"
      : score >= 70
      ? "bg-blue-500"
      : score >= 50
      ? "bg-yellow-500"
      : "bg-muted-foreground";
  const textColor =
    score >= 85
      ? "text-green-600 dark:text-green-400"
      : score >= 70
      ? "text-blue-600 dark:text-blue-400"
      : score >= 50
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-muted-foreground";

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums", textColor)}>
        {score}% · {label}
      </span>
    </div>
  );
};

const SkillChip = ({
  skill,
  onRemove,
}: {
  skill: string;
  onRemove: (skill: string) => void;
}) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
    {skill}
    <button
      type="button"
      onClick={() => onRemove(skill)}
      className="text-primary/60 hover:text-primary transition-colors ml-0.5"
      aria-label={`Remove ${skill}`}
    >
      <XIcon className="h-2.5 w-2.5" />
    </button>
  </span>
);

const JobCard = ({
  job,
  onApply,
}: {
  job: JobListing;
  onApply: (job: JobListing) => void;
}) => (
  <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-primary/40 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold leading-snug truncate flex items-center gap-1.5">
          {job.title}
          {job.clicked ? (
            <CheckCheckIcon
              className="h-3 w-3 text-blue-500 flex-shrink-0"
              aria-label="Previously opened"
            />
          ) : null}
        </h3>
        {job.company && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <BuildingIcon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{job.company}</span>
          </div>
        )}
      </div>
      <ScoreBadge score={job.matchScore} isScoring={job.isScoring} />
    </div>

    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {job.location && (
        <span className="flex items-center gap-1">
          <MapPinIcon className="h-3 w-3" />
          {job.location}
        </span>
      )}
      {job.via && (
        <span className="flex items-center gap-1">
          <ExternalLinkIcon className="h-3 w-3" />
          {job.via}
        </span>
      )}
      {job.postedAt && (
        <span className="flex items-center gap-1">
          <CalendarIcon className="h-3 w-3" />
          {job.postedAt}
        </span>
      )}
      {job.scheduleType && (
        <span className="rounded-sm bg-muted px-1 py-0.5 font-medium">
          {job.scheduleType}
        </span>
      )}
      {job.salary && (
        <span className="rounded-sm bg-primary/10 text-primary px-1 py-0.5 font-medium">
          {job.salary}
        </span>
      )}
    </div>

    {job.snippet && (
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {job.snippet}
      </p>
    )}

    <div className="flex gap-2 pt-1">
      <Button
        size="sm"
        variant="default"
        className="h-7 text-xs"
        onClick={() => onApply(job)}
        disabled={!job.url}
      >
        <ExternalLinkIcon className="h-3 w-3" />
        Apply
      </Button>
    </div>
  </div>
);

const Jobs = () => {
  const navigate = useNavigate();
  const { id: profileId } = useParams<{ id: string }>();
  const { selectedAIProvider, allAiProviders } = useApp();

  const [profile, setProfile] = useState<InterviewProfile | null>(null);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [savedSkillsSnapshot, setSavedSkillsSnapshot] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [totalBeforeFilter, setTotalBeforeFilter] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [skillsJustSaved, setSkillsJustSaved] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const skillInputRef = useRef<HTMLInputElement>(null);

  // Load profile + skills (saved override > AI-extract > keyword fallback)
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      const p = await getProfileById(profileId);
      if (!p || cancelled) return;
      setProfile(p);

      if (p.goals) {
        const firstLine = p.goals.split("\n")[0].trim().substring(0, 80);
        if (firstLine) setKeywords(firstLine);
      }

      // Skills resolution priority:
      // 1. User's saved override (if any)
      // 2. AI extraction (if AI provider configured)
      // 3. Regex keyword fallback
      const saved = getSavedJobSkills(profileId);
      if (saved && saved.length > 0) {
        setSkills(saved);
        setSavedSkillsSnapshot(saved);
        return;
      }

      const aiProvider = allAiProviders.find(
        (x) => x.id === selectedAIProvider.provider
      );
      if (aiProvider && p.resumeText) {
        setSkillsLoading(true);
        try {
          const extracted = await extractSkillsWithAI(
            p.resumeText,
            p.goals,
            aiProvider,
            selectedAIProvider
          );
          if (cancelled) return;
          if (extracted.length > 0) {
            setSkills(extracted);
            setSavedSkillsSnapshot(extracted);
          } else {
            const fallback = extractTopSkills(
              `${p.goals} ${p.resumeText}`,
              10
            );
            setSkills(fallback);
            setSavedSkillsSnapshot(fallback);
          }
        } catch {
          const fallback = extractTopSkills(
            `${p.goals} ${p.resumeText}`,
            10
          );
          setSkills(fallback);
          setSavedSkillsSnapshot(fallback);
        } finally {
          if (!cancelled) setSkillsLoading(false);
        }
      } else if (p.resumeText) {
        const fallback = extractTopSkills(`${p.goals} ${p.resumeText}`, 10);
        setSkills(fallback);
        setSavedSkillsSnapshot(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, allAiProviders, selectedAIProvider]);

  const skillsDirty = useMemo(() => {
    if (skills.length !== savedSkillsSnapshot.length) return true;
    const a = [...skills].sort();
    const b = [...savedSkillsSnapshot].sort();
    return a.some((s, i) => s !== b[i]);
  }, [skills, savedSkillsSnapshot]);

  const handleSaveSkills = () => {
    if (!profileId) return;
    setSavedJobSkills(profileId, skills);
    setSavedSkillsSnapshot(skills);
    setSkillsJustSaved(true);
    setTimeout(() => setSkillsJustSaved(false), 2000);
  };

  const addSkill = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;
    setSkills((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setSkillInput("");
  }, []);

  const removeSkill = useCallback((skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }, []);

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    } else if (e.key === "Backspace" && !skillInput && skills.length > 0) {
      setSkills((prev) => prev.slice(0, -1));
    }
  };

  const handleApply = useCallback(
    async (job: JobListing) => {
      if (!job.url || !profileId || !profile) return;
      recordJobClick(job.url, profileId);
      setJobs((prev) =>
        prev.map((j) => (j.url === job.url ? { ...j, clicked: true } : j))
      );
      setHistoryRefreshKey((k) => k + 1);
      try {
        await openUrl(job.url);
      } catch {}
    },
    [profileId, profile]
  );

  const handleSearch = useCallback(async () => {
    const config = getJobProviderConfig();
    if (!config) {
      setError(
        "No job discovery provider configured. Go to Dev Space → Job Discovery and add your Tavily or Serper API key."
      );
      return;
    }
    const activeKey =
      config.activeProvider === "tavily" ? config.tavilyKey : config.serperKey;
    if (!activeKey) {
      setError(
        `Your active provider (${config.activeProvider}) has no API key saved. Please update your keys in Dev Space.`
      );
      return;
    }
    if (!keywords.trim()) {
      setError("Enter a job title or keywords to search.");
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setJobs([]);
    setTotalBeforeFilter(0);

    try {
      const query = buildJobQuery(keywords, location, skills);
      const rawResults = await searchJobs(config, query);
      setTotalBeforeFilter(rawResults.length);

      // Age filter
      const fresh = filterJobsByAge(rawResults, JOB_MAX_AGE_DAYS);

      // Annotate with history (mark previously-clicked jobs)
      const history = profileId ? getJobHistory(profileId) : [];
      const clickedUrls = new Set(
        history.filter((h) => h.clickedAt).map((h) => h.url)
      );
      const annotated: JobListing[] = fresh.map((j) => ({
        ...j,
        isScoring: false,
        clicked: clickedUrls.has(j.url),
      }));
      setJobs(annotated);

      // Record views for these jobs (per current profile)
      if (profile && profileId) {
        for (const j of annotated) {
          recordJobView({
            id: j.id,
            profileId,
            profileName: profile.name,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.url,
            via: j.via,
            postedAt: j.postedAt,
          });
        }
        setHistoryRefreshKey((k) => k + 1);
      }

      if (!profile?.resumeText) return;

      const aiProvider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!aiProvider) return;

      const toScore = annotated.slice(0, 10);
      setJobs((prev) =>
        prev.map((j, i) => (i < 10 ? { ...j, isScoring: true } : j))
      );

      await Promise.allSettled(
        toScore.map(async (job) => {
          try {
            const score = await scoreJobWithAI(
              job,
              profile.resumeText,
              aiProvider,
              selectedAIProvider
            );
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? { ...j, matchScore: score, isScoring: false }
                  : j
              )
            );
            // Persist score back to history
            if (profileId) {
              recordJobView({
                id: job.id,
                profileId,
                profileName: profile.name,
                title: job.title,
                company: job.company,
                location: job.location,
                url: job.url,
                via: job.via,
                postedAt: job.postedAt,
                matchScore: score,
              });
            }
          } catch {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id ? { ...j, isScoring: false } : j
              )
            );
          }
        })
      );

      setJobs((prev) =>
        [...prev].sort(
          (a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)
        )
      );
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Job search failed";
      setError(msg);
    } finally {
      setIsSearching(false);
    }
  }, [
    keywords,
    location,
    skills,
    profile,
    profileId,
    allAiProviders,
    selectedAIProvider,
  ]);

  const hasProvider = !!getJobProviderConfig();
  const filteredOut = totalBeforeFilter - jobs.length;

  return (
    <PageLayout
      title={profile ? `Find Jobs · ${profile.name}` : "Find Jobs"}
      description={`Showing only jobs posted within the last ${JOB_MAX_AGE_DAYS} days. AI scores each result against your resume.`}
      rightSlot={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/profiles")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Profiles
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dev-space")}
          >
            <SettingsIcon className="h-4 w-4" />
            Configure API
          </Button>
        </div>
      }
    >
      {!hasProvider && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertCircleIcon className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Job discovery not configured</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add a Tavily or Serper.dev API key in{" "}
              <button
                className="underline text-primary"
                onClick={() => navigate("/dev-space")}
              >
                Dev Space
              </button>{" "}
              to enable live job search. Both have generous free tiers.
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <BriefcaseIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Job title or keywords (e.g. Senior Delivery Director)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="relative sm:w-48">
          <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={isSearching || !keywords.trim()}
          className="sm:w-28"
        >
          {isSearching ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <SearchIcon className="h-4 w-4" />
          )}
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Skills editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground font-medium">
              Core competencies / skills
              {skillsLoading
                ? " · extracting with AI…"
                : profile && skills.length > 0
                ? savedSkillsSnapshot === skills
                  ? " · AI-extracted from resume"
                  : " · edited"
                : ""}
            </p>
            {skillsLoading && (
              <Loader2Icon className="h-3 w-3 animate-spin text-primary" />
            )}
          </div>
          {skillsDirty && (
            <Button
              size="sm"
              variant={skillsJustSaved ? "outline" : "default"}
              className="h-6 text-[10px] px-2 gap-1"
              onClick={handleSaveSkills}
            >
              <SaveIcon className="h-3 w-3" />
              {skillsJustSaved ? "Saved!" : "Save skills"}
            </Button>
          )}
        </div>
        <div
          className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-muted/30 min-h-[36px] cursor-text"
          onClick={() => skillInputRef.current?.focus()}
        >
          {skills.map((skill) => (
            <SkillChip key={skill} skill={skill} onRemove={removeSkill} />
          ))}
          <div className="flex items-center gap-1 flex-1 min-w-[120px]">
            <input
              ref={skillInputRef}
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              placeholder={
                skillsLoading
                  ? "AI is reading your resume…"
                  : skills.length === 0
                  ? "Type a skill and press Enter…"
                  : "Add skill…"
              }
              className="bg-transparent text-[11px] outline-none flex-1 placeholder:text-muted-foreground/60 min-w-[80px]"
              disabled={skillsLoading}
            />
            {skillInput.trim() && (
              <button
                type="button"
                onClick={() => addSkill(skillInput)}
                className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
              >
                <PlusIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter/comma to add, Backspace to remove last. Edits are saved
          per-profile when you click "Save skills".
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <AlertCircleIcon className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isSearching && jobs.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {totalBeforeFilter > 0
            ? `All ${totalBeforeFilter} results were older than ${JOB_MAX_AGE_DAYS} days and were hidden. Try different keywords.`
            : "No jobs found. Try different keywords or location."}
        </p>
      )}

      {jobs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {jobs.length} fresh job{jobs.length !== 1 ? "s" : ""}
            {filteredOut > 0 && (
              <>
                {" "}
                · {filteredOut} hidden (older than {JOB_MAX_AGE_DAYS} days)
              </>
            )}
            {profile ? " · scoring against your resume…" : ""}
          </p>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onApply={handleApply} />
          ))}
        </div>
      )}

      {!hasSearched && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <BriefcaseIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Find your next role</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Live job listings from LinkedIn, Naukri, Indeed and more.
              AI-scored against your resume. Only jobs posted within the last{" "}
              {JOB_MAX_AGE_DAYS} days are shown.
            </p>
          </div>
        </div>
      )}

      {/* History */}
      <div className="pt-4 border-t border-border/60">
        <JobHistorySection
          profileId={profileId}
          title={
            profile ? `History · ${profile.name}` : "Recently viewed jobs"
          }
          refreshKey={historyRefreshKey}
        />
      </div>
    </PageLayout>
  );
};

export default Jobs;
