import type { Tool } from "./index";
import { getSecret } from "../secrets";
import { getHttpFetch } from "../http";
import { CdpClient } from "./cdp-client";
import { fillForm, filledSummary, type FillProfile } from "./field-fill";
import { getMemoryByKey } from "../database";

const API_BASE = "https://job-hunter-x5l1.onrender.com";
const TOKEN_KEY = "JOB_HUNTER_API_TOKEN";

interface JobRow {
  job_id: string;
  title: string;
  company: string;
  location?: string;
  fit?: number;
  freshness?: string;
  portal?: string;
  created_at?: string;
  imported_date?: string;
  url?: string;
  status?: string;
}

export const getJobApplyTool: Tool = {
  name: "job_apply",
  description: "Open the next unapplied job's apply page in Chrome via CDP, detect the Apply button, and click it. Say 'apply to the next job' or 'apply now' to trigger.",
  run: async (_args, _ctx) => {
    try {
      const token = await getSecret(TOKEN_KEY);
      if (!token) {
        return {
          success: false,
          output: "Job-hunter API token is not configured. Add it in Settings under Job Hunter.",
          error: "JOB_HUNTER_API_TOKEN not found in secure storage",
        };
      }

      const httpFetch = getHttpFetch();

      let nextJob: JobRow;
      try {
        const res = await httpFetch(`${API_BASE}/api/jobs?status=not_applied&limit=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (res.status === 401) {
          return {
            success: false,
            output: "The job-hunter API token seems to be invalid. Please check it in Settings.",
            error: "Job-hunter API returned 401 Unauthorized",
          };
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return {
            success: false,
            output: "I couldn't fetch your job queue right now.",
            error: `Job-hunter API returned ${res.status}: ${body.slice(0, 200)}`,
          };
        }

        const data = await res.json() as { rows: JobRow[]; total: number };
        const rows = data?.rows ?? [];

        if (rows.length === 0) {
          return {
            success: true,
            output: "No unapplied jobs in your pipeline, sir. Your queue is clear.",
            data: { job_id: "", title: "", company: "" } as Record<string, string>,
          };
        }

        nextJob = rows[0];
      } catch (err) {
        return {
          success: false,
          output: "I couldn't reach the job-hunter service. It may be starting up.",
          error: `Network error fetching job queue: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (!nextJob.url) {
          return {
            success: true,
            output: `The next job is ${nextJob.title} at ${nextJob.company}, but it doesn't have an apply URL, sir.`,
            data: { job_id: nextJob.job_id, title: nextJob.title, company: nextJob.company } as Record<string, string>,
          };
      }

      const cdp = new CdpClient();
      try {
        const targets = await cdp.listTargets();
        if (targets.length === 0) {
          return {
            success: false,
            output: "I can't reach your Chrome — is it running with debugging on, sir? No browser tabs found.",
            error: "No page targets found on localhost:9222",
          };
        }

        const target = targets[0];
        await cdp.connect(target.webSocketDebuggerUrl);
        await cdp.navigate(nextJob.url);

        const applyResult = await cdp.clickApplyButton();

        const portal = nextJob.portal || "the";
        const title = nextJob.title;
        const company = nextJob.company;

        let spokenResponse: string;
        if (applyResult.clicked) {
          try {
            const mem = await getMemoryByKey("application_profile");
            if (mem?.value) {
              const profile: FillProfile = JSON.parse(mem.value);
              const fillResult = await fillForm(cdp, profile);
              spokenResponse = `Opened the ${portal} application for ${title} at ${company}, sir. ${filledSummary(fillResult)}`;
            } else {
              spokenResponse = `Opened the ${portal} application for ${title} at ${company}, sir — the Apply form is up, but I don't have your application profile yet, sir.`;
            }
          } catch {
            spokenResponse = `Opened the ${portal} application for ${title} at ${company}, sir — the Apply form is up, but I could not fill the fields automatically.`;
          }
        } else if (applyResult.found) {
          spokenResponse = `Opened the ${portal} application for ${title} at ${company}, sir. The page has an external Apply link — that is beyond MVP scope, sir.`;
        } else {
          spokenResponse = `Opened the ${portal} application for ${title} at ${company}, sir. The page is loaded, but I could not spot the Apply button automatically.`;
        }

        return {
          success: true,
          output: spokenResponse,
          data: {
            job_id: nextJob.job_id,
            title,
            company,
            portal: nextJob.portal ?? "",
            buttonFound: String(applyResult.found),
          } as Record<string, string>,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("WebSocket") || msg.includes("connect") || msg.includes("fetch")) {
          return {
            success: false,
            output: "I can't reach your Chrome — is it running with debugging on, sir?",
            error: `CDP connection failed: ${msg}`,
          };
        }
        return {
          success: false,
          output: "I couldn't complete the application, sir.",
          error: msg,
        };
      } finally {
        try {
          await cdp.disconnect();
        } catch {
          // Non-critical cleanup
        }
      }
    } catch (err) {
      return {
        success: false,
        output: "I couldn't apply to that job, sir.",
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
