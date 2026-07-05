import type { Tool } from "./index";
import { getSecret } from "../secrets";
import { getHttpFetch } from "../http";

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
  scores_json?: string;
}

interface QueueResponse {
  rows: JobRow[];
  total: number;
}

export const getJobQueueTool: Tool = {
  name: "get_job_queue",
  description: "Fetch the current job queue (unapplied jobs) from the job-hunter API and return a spoken summary with count and top entries by fit score and freshness.",
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

      let queueData: QueueResponse;
      try {
        const res = await httpFetch(`${API_BASE}/api/jobs?status=not_applied&limit=25`, {
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

        queueData = await res.json() as QueueResponse;
      } catch (err) {
        return {
          success: false,
          output: "I couldn't reach the job-hunter service. It may be starting up.",
          error: `Network error fetching job queue: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const rows = queueData?.rows ?? [];
      const total = queueData?.total ?? rows.length;

      if (total === 0) {
        return {
          success: true,
          output: "Your job queue is empty, sir — no unapplied jobs.",
          data: { count: "0", total: "0" },
        };
      }

      const sorted = [...rows].sort((a, b) => {
        const fitA = a.fit ?? 0;
        const fitB = b.fit ?? 0;
        if (fitB !== fitA) return fitB - fitA;
        return ((b.created_at ?? b.imported_date) ?? "").localeCompare((a.created_at ?? a.imported_date) ?? "");
      });

      const top = sorted.slice(0, 3);

      const topItems = top
        .map((j) => `${j.title} at ${j.company}${j.fit != null ? ` (fit ${j.fit})` : ""}`)
        .join("; ");

      let spokenResponse = `You have ${total} job${total > 1 ? "s" : ""} in your pipeline, sir. Top ${top.length > 1 ? "3" : "one"} by fit: ${topItems}.`;

      const newToday = rows.filter((r) => {
        const d = (r.created_at ?? r.imported_date ?? "").slice(0, 10);
        return d === new Date().toISOString().slice(0, 10);
      }).length;

      if (newToday > 0) {
        spokenResponse += ` ${newToday} added today.`;
      }

      return {
        success: true,
        output: spokenResponse,
        data: {
          count: String(rows.length),
          total: String(total),
        },
      };
    } catch (err) {
      return {
        success: false,
        output: "I couldn't check your job queue.",
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
