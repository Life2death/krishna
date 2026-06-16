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
