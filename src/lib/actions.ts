import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply, StepAction } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";
import { resolveTarget, saveAndConfirm, needsConfirmation } from "@/lib/resolver";
import type { ResolveResult } from "@/lib/resolver";
import { getTravelTimeTool } from "@krishna/core/tools/get-travel-time";
import { gmailSearchMessagesTool, gmailReadMessageTool, gmailListLabelsTool, gmailSendEmailTool, gmailFetchRecruiterCandidates } from "@krishna/core/tools/gmail";
import { getResponseSettings } from "@krishna/core/settings";
import { runRecruiterRadar, formatRecruiterOutput, COLD_START_DAYS } from "@krishna/core/tools/recruiter-radar";
import type { Candidate, Classification } from "@krishna/core/tools/recruiter-radar";
import { getLastCheckAt } from "@krishna/core/tools/recruiter-radar-state";

const ACTION_REGEX = /```action\n([\s\S]*?)```/g;
const JSON_BLOCK_REGEX = /```json\n([\s\S]*?)```/g;
const PLAN_REGEX = /```plan\n([\s\S]*?)```/;

export function parseActions(reply: string): ParsedReply {
  let spokenText = reply;
  const actions: Action[] = [];
  let plan: { say: string; needsConfirmation: boolean; steps: StepAction[] } | undefined;

  const planMatch = reply.match(PLAN_REGEX);
  if (planMatch) {
    try {
      const parsed = JSON.parse(planMatch[1].trim());
      if (parsed && parsed.say && Array.isArray(parsed.plan)) {
        plan = {
          say: parsed.say,
          needsConfirmation: parsed.needsConfirmation !== false,
          steps: parsed.plan.map((step: any) => ({
            tool: step.tool,
            args: step.args || {},
            out: step.out,
          })),
        };
        if (plan.steps.length === 1 && plan.steps[0].tool === "open_target") {
          const target = plan.steps[0].args.target || "";
          actions.push({ action: "open", target });
        }
      }
    } catch {
      // Not valid JSON, ignore
    }
    spokenText = spokenText.replace(planMatch[0], "").trim();
  }

  if (!plan) {
    // Collect all action blocks (both ```action and ```json)
    const allBlocks = [...reply.matchAll(ACTION_REGEX), ...reply.matchAll(JSON_BLOCK_REGEX)];
    for (const match of allBlocks) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed && parsed.action === "open" && parsed.target) {
          actions.push({ action: "open", target: parsed.target });
        }
        if (parsed && parsed.action === "remember" && parsed.value) {
          actions.push({ action: "remember", key: parsed.key ?? null, value: parsed.value });
        }
        if (parsed && parsed.action === "travel_time") {
          actions.push({ action: "travel_time", from: parsed.from, to: parsed.to, mode: parsed.mode });
        }
        if (parsed && parsed.action === "gmail_search") {
          actions.push({ action: "gmail_search", query: parsed.query ?? "", maxResults: parsed.maxResults });
        }
        if (parsed && parsed.action === "gmail_read") {
          actions.push({ action: "gmail_read", id: parsed.id ?? "" });
        }
        if (parsed && parsed.action === "gmail_list_labels") {
          actions.push({ action: "gmail_list_labels" });
        }
        if (parsed && parsed.action === "gmail_send") {
          actions.push({ action: "gmail_send", to: parsed.to ?? "", subject: parsed.subject ?? "", body: parsed.body ?? "", cc: parsed.cc, bcc: parsed.bcc });
        }
        if (parsed && parsed.action === "gmail_recruiters") {
          actions.push({ action: "gmail_recruiters", window_days: parsed.window_days });
        }
      } catch {
        // Not valid JSON, ignore
      }
      spokenText = spokenText.replace(match[0], "").trim();
    }
  }

  return { spokenText, actions, plan };
}

export interface ExecuteActionResult {
  kind?: "answer" | "status";
  spokenResponse: string;
  needsConfirmation?: boolean;
  pendingResult?: ResolveResult;
  learnedActionId?: string;
  input?: string;
  ok?: boolean;
  errorDetail?: string;
}

export interface ActionResponsePlan {
  shouldSpeak: boolean;
  recordTurn: boolean;
  outcome: "answered" | "failed";
  failureReason?: "tool_failed";
  detail?: string;
}

export function decideActionResponse(
  result: ExecuteActionResult,
  spokenTextRecorded: boolean,
): ActionResponsePlan | null {
  if (!result.spokenResponse) return null;

  if (result.kind === "answer") {
    return {
      shouldSpeak: true,
      recordTurn: true,
      outcome: result.ok !== false ? "answered" : "failed",
      failureReason: result.ok !== false ? undefined : "tool_failed",
      detail: result.errorDetail || (result.ok !== false ? undefined : result.spokenResponse),
    };
  }

  if (result.kind === "status") {
    if (spokenTextRecorded) {
      return { shouldSpeak: false, recordTurn: false, outcome: "answered" };
    }
    const toolFailed = result.ok === false || result.spokenResponse.startsWith("Failed");
    return {
      shouldSpeak: true,
      recordTurn: true,
      outcome: toolFailed ? "failed" : "answered",
      failureReason: toolFailed ? "tool_failed" : undefined,
      detail: result.errorDetail || (toolFailed ? result.spokenResponse : undefined),
    };
  }

  // Legacy: no kind — fall back to prefix heuristic unchanged
  if (spokenTextRecorded) {
    return { shouldSpeak: false, recordTurn: false, outcome: "answered" };
  }
  const isStatusLegacy = result.spokenResponse.startsWith("Opening") || result.spokenResponse.startsWith("Failed");
  if (!isStatusLegacy) return null;
  const toolFailed = result.spokenResponse.startsWith("Failed");
  return {
    shouldSpeak: true,
    recordTurn: true,
    outcome: toolFailed ? "failed" : "answered",
    failureReason: toolFailed ? "tool_failed" : undefined,
    detail: result.errorDetail || (toolFailed ? result.spokenResponse : undefined),
  };
}

// A "save claim" in the spoken reply (e.g. "saved", "I'll save that", "noted").
const CLAIMED_SAVE_RE = /\b(saved|save (that|this|it)|I('|')ll (remember|save)|remembered|noted)\b/i;
// Remember-intent in the USER's turn — deliberately typo-tolerant ("rember", "remmber").
const USER_REMEMBER_INTENT_RE = /\b(rem+e?m?ber|save|note|keep in mind|address is)\b/i;

/**
 * T4-F1 grounding: detect a "phantom save" — the model spoke a save claim
 * ("your address is now saved") WITHOUT emitting a remember action, so nothing
 * was actually persisted. The user-intent guard prevents false positives on
 * incidental uses of "saved"/"save" (e.g. "Ronaldo saved the match").
 */
export function detectPhantomSave(
  userCommand: string,
  spokenText: string,
  actions: Action[],
): boolean {
  if (!spokenText) return false;
  return (
    USER_REMEMBER_INTENT_RE.test(userCommand) &&
    CLAIMED_SAVE_RE.test(spokenText) &&
    !actions.some((a) => a.action === "remember")
  );
}

type LlmFallbackFn = (input: string) => Promise<string | null>;

function buildRecruiterClassify(
  llmFallback: LlmFallbackFn,
): (candidates: Candidate[]) => Promise<Classification[]> {
  return async (candidates: Candidate[]): Promise<Classification[]> => {
    const prompt = `Classify each email below as "recruiter_outreach", "job_alert_digest", or "other".

- recruiter_outreach: human recruiter/TA/consultancy outreach, LinkedIn InMail/messaging notifications, Naukri recruiter-contact notifications. Extract when present: recruiterName, company, roleTitle, via ("direct"|"linkedin"|"naukri"|"other").
- job_alert_digest: LinkedIn/Naukri/Indeed "N new jobs" digests, newsletters, marketing.
- other: everything else.

Respond with ONLY a valid JSON array, no other text. Example:
[{"id":"msg1","class":"recruiter_outreach","recruiterName":"Priya","company":"ABC","roleTitle":"Engineer","via":"linkedin"}]

Emails:
${JSON.stringify(candidates.map((c) => ({ id: c.id, from: c.from, subject: c.subject, snippet: c.snippet })))}`;

    const raw = await llmFallback(prompt);
    if (!raw) throw new Error("LLM classify returned empty");

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("LLM classify did not return an array");

    return parsed as Classification[];
  };
}

export async function executeAction(
  action: Action,
  llmFallback?: LlmFallbackFn,
  options?: { preConfirmed?: boolean }
): Promise<ExecuteActionResult> {
  if (action.action === "travel_time") {
    const to = action.to || "";
    const mode = action.mode || "car";

    if (!to) {
      return { kind: "answer", spokenResponse: "Where would you like to go?" };
    }

    const result = await getTravelTimeTool.run({ from: action.from ?? "home", to, mode }, { vars: {} });

    if (result.data?.url) {
      try {
        await invoke("open_target", { target: result.data.url });
      } catch {
        // URL open failure is non-critical
      }
    }

    return {
      kind: "answer",
      spokenResponse: result.output || "I couldn't find a route.",
      ok: result.success,
      errorDetail: result.data?.errorDetail,
    };
  }

  if (action.action === "gmail_search") {
    const result = await gmailSearchMessagesTool.run(
      { query: action.query, maxResults: String(action.maxResults ?? 10) },
      { vars: {} },
    );
    return {
      kind: "answer",
      spokenResponse: result.success ? (result.output || "I couldn't search Gmail.") : (result.error || "I couldn't search Gmail."),
      ok: result.success,
    };
  }

  if (action.action === "gmail_read") {
    const result = await gmailReadMessageTool.run(
      { id: action.id },
      { vars: {} },
    );
    return {
      kind: "answer",
      spokenResponse: result.success ? (result.output || "I couldn't read that message.") : (result.error || "I couldn't read that message."),
      ok: result.success,
    };
  }

  if (action.action === "gmail_list_labels") {
    const result = await gmailListLabelsTool.run({}, { vars: {} });
    return {
      kind: "answer",
      spokenResponse: result.success ? (result.output || "I couldn't list labels.") : (result.error || "I couldn't list labels."),
      ok: result.success,
    };
  }

  if (action.action === "gmail_recruiters") {
    try {
      const now = Date.now();
      const since = action.window_days
        ? now - action.window_days * 86400000
        : (await getLastCheckAt()) || now - COLD_START_DAYS * 86400000;

      const { candidates, capHit, inboxFallback } = await gmailFetchRecruiterCandidates(since);

      if (candidates.length === 0) {
        const prefix = inboxFallback ? "I checked your inbox, sir — " : "";
        return {
          kind: "answer",
          spokenResponse: `${prefix}No recruiter emails since the last check, sir.`,
          ok: true,
        };
      }

      const classify = llmFallback
        ? buildRecruiterClassify(llmFallback)
        : () => Promise.reject<Classification[]>(new Error("No LLM fallback"));

      const { result, newOutreach, since: actualSince } = await runRecruiterRadar(
        candidates,
        classify,
        { windowDays: action.window_days, capHit },
      );

      const prefix = inboxFallback ? "I checked your inbox, sir — " : "";
      let spokenResponse = prefix + formatRecruiterOutput(newOutreach, candidates, {
        since: actualSince,
        capHit: result.capHit,
        degraded: result.degraded,
      });

      if (newOutreach.length > 0) {
        spokenResponse += ` To read the newest one, use gmail_read with id "${newOutreach[0].id}".`;
      }

      return {
        kind: "answer",
        spokenResponse,
        ok: true,
        errorDetail: result.error,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "answer",
        ok: false,
        spokenResponse: "I couldn't check recruiter mail, sir.",
        errorDetail: msg,
      };
    }
  }

  if (action.action === "gmail_send") {
    const result = await gmailSendEmailTool.run(
      { to: action.to, subject: action.subject, body: action.body, cc: action.cc ?? "", bcc: action.bcc ?? "" },
      { vars: {}, preConfirmed: options?.preConfirmed },
    );
    return {
      kind: "status",
      spokenResponse: result.success ? (result.output || "Failed to send email.") : (result.error || "Failed to send email."),
      ok: result.success,
    };
  }

  if (action.action === "open") {
    const rawTarget = action.target.trim();
    const lowerTarget = rawTarget.toLowerCase();

    if (isUrl(rawTarget)) {
      const url = rawTarget.startsWith("http") ? rawTarget : "https://" + rawTarget;
      try {
        await invoke("open_target", { target: url });
        return { kind: "status", spokenResponse: "Opening " + rawTarget };
      } catch {
        return { kind: "status", spokenResponse: "Failed to open " + rawTarget };
      }
    }

    if (isFilePath(rawTarget)) {
      try {
        await invoke("open_target", { target: rawTarget });
        return { kind: "status", spokenResponse: "Opening file path" };
      } catch {
        return { kind: "status", spokenResponse: "Failed to open path" };
      }
    }

    const alias = resolveAppAlias(lowerTarget);
    if (alias) {
      try {
        await invoke("open_target", { target: alias.launchCommand });
        return { kind: "status", spokenResponse: "Opening " + alias.name };
      } catch {
        return { kind: "status", spokenResponse: "Failed to open " + alias.name };
      }
    }

    const result = await resolveTarget(rawTarget, llmFallback);
    if (result.found && result.target) {
      if (needsConfirmation(result)) {
        return {
          spokenResponse: "I found " + result.displayName + ". Should I open it?",
          needsConfirmation: true,
          pendingResult: result,
          input: rawTarget,
        };
      }
      await saveAndConfirm(result, rawTarget);
      await invoke("open_target", { target: result.target });
      return { kind: "status", spokenResponse: "Opening " + result.displayName };
    }

    return { kind: "status", ok: false, spokenResponse: "I couldn't find an app named \"" + rawTarget + "\"" };
  }

  return { spokenResponse: "Unknown action" };
}

/** Resolve an action to a confirmable pendingResult without executing it.
 *  Used for unverified-speaker gating: always returns needsConfirmation=true
 *  with a proper ResolveResult (has .target, .displayName, .found) so the
 *  accept handler can execute it on "yes".
 */
export async function resolveActionForConfirm(
  action: Action,
  llmFallback?: LlmFallbackFn
): Promise<ExecuteActionResult> {
  if (action.action === "travel_time") {
    const from = action.from || "home";
    const to = action.to || "";
    const mode = action.mode || "car";
    const placeStr = [from, to].filter(Boolean).join(" to ");
    return {
      spokenResponse: `Check travel time from ${placeStr} by ${mode}?`,
      needsConfirmation: true,
      pendingResult: {
        found: true,
        displayName: `travel_time: ${placeStr}`,
        target: "",
        actionToResume: JSON.stringify({ action: "travel_time", from, to, mode }),
      } as any,
    };
  }

  if (action.action === "gmail_send") {
    return {
      spokenResponse: `Send email to ${action.to} with subject "${action.subject}"?`,
      needsConfirmation: true,
      pendingResult: {
        found: true,
        displayName: `gmail_send: ${action.to}`,
        target: "",
        actionToResume: JSON.stringify(action),
      } as any,
    };
  }

  if (action.action === "open") {
    const rawTarget = action.target.trim();
    const lowerTarget = rawTarget.toLowerCase();

    if (isUrl(rawTarget)) {
      const url = rawTarget.startsWith("http") ? rawTarget : "https://" + rawTarget;
      return {
        spokenResponse: "Open " + rawTarget + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: url, displayName: rawTarget, source: "direct" } as ResolveResult,
        input: rawTarget,
      };
    }

    if (isFilePath(rawTarget)) {
      return {
        spokenResponse: "Open " + rawTarget + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: rawTarget, displayName: rawTarget, source: "direct" } as ResolveResult,
        input: rawTarget,
      };
    }

    const alias = resolveAppAlias(lowerTarget);
    if (alias) {
      return {
        spokenResponse: "Open " + alias.name + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: alias.launchCommand, displayName: alias.name, source: "alias" } as ResolveResult,
        input: rawTarget,
      };
    }

    const result = await resolveTarget(rawTarget, llmFallback);
    if (result.found && result.target) {
      return {
        spokenResponse: "I found " + result.displayName + ". Should I open it?",
        needsConfirmation: true,
        pendingResult: result,
        input: rawTarget,
      };
    }

    return { spokenResponse: "I couldn't find an app named \"" + rawTarget + "\"" };
  }

  return { spokenResponse: "Unknown action" };
}