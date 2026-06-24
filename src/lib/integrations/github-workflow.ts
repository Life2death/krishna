import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { secureStorage } from "@/lib/secure-storage";

/** secureStorage key for the user's fine-grained GitHub PAT (Actions: read/write on job-hunter only). */
export const GITHUB_PAT_STORAGE_KEY = "integration_github_pat";

// Hardcoded target — Vikram's job-hunter repo. Single user, single workflow; not worth making configurable yet.
const JOB_HUNTER_REPO = "Life2death/job-hunter";
const JOB_HUNTER_WORKFLOW_FILE = "daily_extract.yml";
const JOB_HUNTER_REF = "master";

export interface TriggerWorkflowResult {
  success: boolean;
  error?: string;
}

export interface WorkflowStatusResult {
  success: boolean;
  /** Human/spoken summary of the latest run, when success. */
  summary?: string;
  error?: string;
}

const GITHUB_HEADERS = (pat: string) => ({
  Authorization: `Bearer ${pat}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Krishna-Assistant",
});

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function describeRun(run: {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  updated_at?: string;
}): string {
  const { status, conclusion } = run;
  if (status === "completed") {
    const when = relativeTime(run.updated_at || run.created_at || "");
    if (conclusion === "success") return `Your daily job extraction completed successfully ${when}.`;
    if (conclusion === "failure") return `The last job extraction run failed ${when}. You may want to check the logs.`;
    if (conclusion === "cancelled") return `The last job extraction run was cancelled ${when}.`;
    return `The last job extraction run finished ${when} with status ${conclusion ?? "unknown"}.`;
  }
  if (status === "in_progress") {
    return `Your job extraction is still running — it started ${relativeTime(run.created_at || "")}.`;
  }
  if (status === "queued" || status === "waiting" || status === "requested" || status === "pending") {
    return "Your job extraction is queued and waiting to start.";
  }
  return `The latest job extraction run is currently ${status ?? "in an unknown state"}.`;
}

/**
 * Fires a workflow_dispatch on the job-hunter "Daily Job Extraction" workflow,
 * bypassing GitHub's free-tier cron queue delay.
 */
export async function triggerJobExtractionWorkflow(): Promise<TriggerWorkflowResult> {
  const pat = await secureStorage.get(GITHUB_PAT_STORAGE_KEY);
  if (!pat) {
    return {
      success: false,
      error: "No GitHub token configured. Add one in Settings under Integrations.",
    };
  }

  try {
    const response = await tauriFetch(
      `https://api.github.com/repos/${JOB_HUNTER_REPO}/actions/workflows/${JOB_HUNTER_WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Krishna-Assistant",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: JOB_HUNTER_REF, inputs: { portal: "all" } }),
      }
    );

    // GitHub returns 204 No Content on a successful dispatch.
    if (response.status === 204) {
      return { success: true };
    }

    let errorDetail = `GitHub API returned ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) errorDetail = data.message;
    } catch {
      // Response body wasn't JSON; keep the generic status message.
    }
    return { success: false, error: errorDetail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error reaching GitHub";
    return { success: false, error: msg };
  }
}

/**
 * Reads the most recent run of the job-hunter "Daily Job Extraction" workflow and
 * returns a spoken-friendly status summary. Read-only — uses the same PAT (Actions: read).
 */
export async function getJobExtractionStatus(): Promise<WorkflowStatusResult> {
  const pat = await secureStorage.get(GITHUB_PAT_STORAGE_KEY);
  if (!pat) {
    return {
      success: false,
      error: "No GitHub token configured. Add one in Settings under Integrations.",
    };
  }

  try {
    const response = await tauriFetch(
      `https://api.github.com/repos/${JOB_HUNTER_REPO}/actions/workflows/${JOB_HUNTER_WORKFLOW_FILE}/runs?per_page=1`,
      { method: "GET", headers: GITHUB_HEADERS(pat) }
    );

    if (response.status !== 200) {
      let errorDetail = `GitHub API returned ${response.status}`;
      try {
        const data = await response.json();
        if (data?.message) errorDetail = data.message;
      } catch {
        // Response body wasn't JSON; keep the generic status message.
      }
      return { success: false, error: errorDetail };
    }

    const data = await response.json();
    const run = data?.workflow_runs?.[0];
    if (!run) {
      return { success: true, summary: "I couldn't find any recent job extraction runs yet." };
    }
    return { success: true, summary: describeRun(run) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error reaching GitHub";
    return { success: false, error: msg };
  }
}
