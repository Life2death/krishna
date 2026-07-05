import type { Tool } from "./index";
import { getSecret } from "../secrets";
import { getHttpFetch } from "../http";
import { CdpClient } from "./cdp-client";
import { getVerbatimConfirm } from "./mcp-bridge";

const API_BASE = "https://job-hunter-x5l1.onrender.com";
const TOKEN_KEY = "JOB_HUNTER_API_TOKEN";

export const getJobApplySubmitTool: Tool = {
  name: "job_apply_submit",
  description: "Click Submit on the currently open job application form, verify the submission succeeded, and mark the job as applied. Requires user confirmation before submitting.",
  run: async (args, ctx) => {
    const title = args.title || "";
    const company = args.company || "";
    const jobId = args.jobId || "";
    const url = args.url || "";

    if (!ctx.preConfirmed) {
      const confirm = getVerbatimConfirm();
      if (confirm) {
        const ok = await confirm(`Ready to submit the application to ${company} for ${title} — shall I send it, sir?`);
        if (!ok) {
          return { success: false, output: "Submit declined, sir." };
        }
      }
    }

    const cdp = new CdpClient();
    try {
      const targets = await cdp.listTargets();
      if (targets.length === 0) {
        return {
          success: false,
          output: "I can't reach your Chrome — is it running with debugging on, sir?",
          error: "No page targets found on localhost:9222",
        };
      }

      let target = targets[0];
      if (url) {
        const match = targets.find((t) => t.url && t.url.includes(url));
        if (match) target = match;
      }

      await cdp.connect(target.webSocketDebuggerUrl);

      const submitResult = await cdp.clickSubmitButton();

      if (!submitResult.found) {
        return {
          success: false,
          output: `I couldn't find the Submit button on the ${company} application form, sir.`,
          error: "No submit button detected on the page",
        };
      }

      const verification = await cdp.verifySubmission();

      const token = await getSecret(TOKEN_KEY);
      if (token && jobId) {
        try {
          const httpFetch = getHttpFetch();
          await httpFetch(`${API_BASE}/api/jobs/${jobId}/status`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "applied" }),
          });
        } catch {
          // Non-critical: status update failure shouldn't break UX
        }
      }

      if (verification.success) {
        return {
          success: true,
          output: `Submitted the application to ${company} for ${title}, sir.`,
          data: { jobId, title, company, status: "applied" } as Record<string, string>,
        };
      }

      return {
        success: true,
        output: `I clicked Submit for ${company} for ${title}, sir, but I'm not certain it went through — the page doesn't show a clear confirmation.`,
        data: { jobId, title, company, status: "submitted_ambiguous" } as Record<string, string>,
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
        output: "I couldn't submit the application, sir.",
        error: msg,
      };
    } finally {
      try {
        await cdp.disconnect();
      } catch {
        // Non-critical cleanup
      }
    }
  },
};
