import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply, StepAction } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";
import { resolveTarget, saveAndConfirm, needsConfirmation } from "@/lib/resolver";
import type { ResolveResult } from "@/lib/resolver";
import { getTravelTimeTool, suggestDepartureTimeTool } from "@krishna/core/tools/get-travel-time";
import { getJobQueueTool } from "@krishna/core/tools/job-queue";
import { getJobApplyTool } from "@krishna/core/tools/job-apply";
import { getJobApplySubmitTool } from "@krishna/core/tools/job-apply-submit";
import { gmailSearchMessagesTool, gmailReadMessageTool, gmailListLabelsTool, gmailSendEmailTool, gmailFetchRecruiterCandidates } from "@krishna/core/tools/gmail";
import { getResponseSettings } from "@krishna/core/settings";
import { runRecruiterRadar, formatRecruiterOutput, COLD_START_DAYS } from "@krishna/core/tools/recruiter-radar";
import type { Candidate, Classification } from "@krishna/core/tools/recruiter-radar";
import { getLastCheckAt } from "@krishna/core/tools/recruiter-radar-state";
import { createRouteWatch, getActiveRouteWatch, cancelRouteWatch, disableLine, getLinesByText, insertLine, getAllLines, getAllLinesByCategory, banPhrase, enableAllPendingLlmLines } from "@krishna/core/database";
import { resolvePlace } from "@krishna/core/tools/place-resolver";
import { controlWindowTool } from "@krishna/core/tools/computer";

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
        if (parsed && parsed.action === "travel_best") {
          actions.push({ action: "travel_best", from: parsed.from, to: parsed.to, mode: parsed.mode, window_hours: parsed.window_hours });
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
        if (parsed && parsed.action === "job_queue") {
          actions.push({ action: "job_queue" });
        }
        if (parsed && parsed.action === "job_apply") {
          actions.push({ action: "job_apply" });
        }
        if (parsed && parsed.action === "job_apply_submit") {
          actions.push({ action: "job_apply_submit", url: parsed.url ?? "", jobId: parsed.jobId ?? "", title: parsed.title ?? "", company: parsed.company ?? "" });
        }
        if (parsed && parsed.action === "route_watch") {
          actions.push({
            action: "route_watch",
            from: parsed.from,
            to: parsed.to,
            mode: parsed.mode,
            threshold_minutes: parsed.threshold_minutes,
            interval_minutes: parsed.interval_minutes,
            window_hours: parsed.window_hours,
          });
        }
        if (parsed && parsed.action === "route_watch_cancel") {
          actions.push({ action: "route_watch_cancel" });
        }
        if (parsed && parsed.action === "speech_ban" && parsed.phrase) {
          actions.push({ action: "speech_ban", phrase: parsed.phrase });
        }
        if (parsed && parsed.action === "speech_teach" && parsed.phrase) {
          actions.push({ action: "speech_teach", phrase: parsed.phrase, category: parsed.category });
        }
        if (parsed && parsed.action === "speech_refresh") {
          actions.push({ action: "speech_refresh" });
        }
        if (parsed && parsed.action === "speech_accept_vocabulary") {
          actions.push({ action: "speech_accept_vocabulary" });
        }
        if (parsed && parsed.action === "control_window" && parsed.target) {
          const mode = parsed.mode === "move" ? "move" : "focus";
          actions.push({ action: "control_window", mode, target: parsed.target, monitor: parsed.monitor });
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

export function extractJsonArray(raw: string): unknown {
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in LLM response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function buildRecruiterClassify(
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

    const parsed = extractJsonArray(raw);
    if (!Array.isArray(parsed)) throw new Error("LLM classify did not return an array");

    return parsed as Classification[];
  };
}

async function getOwnerUtterances(limit = 20): Promise<string[]> {
  try {
    const { getAllConversations } = await import("@krishna/core/database");
    const conversations = await getAllConversations();
    const utterances: string[] = [];
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.role === "user" && msg.content.trim()) {
          utterances.push(msg.content.trim());
          if (utterances.length >= limit) break;
        }
      }
      if (utterances.length >= limit) break;
    }
    return utterances;
  } catch {
    return [];
  }
}

export async function vocabularyRefresh(
  llmFallback: LlmFallbackFn,
): Promise<{ total: number; categories: string[] }> {
  const { getAllLines, getDisabledLines, insertLine, getAllLinesByCategory, getBannedPhrases } = await import("@krishna/core/database");

  const utterances = await getOwnerUtterances(20);
  const allLines = await getAllLines();
  const disabled = await getDisabledLines();
  const rawBanned = await getBannedPhrases();

  const currentByCategory: Record<string, string[]> = {};
  for (const line of allLines) {
    if (!currentByCategory[line.category]) currentByCategory[line.category] = [];
    currentByCategory[line.category].push(line.text);
  }

  // Includes raw owner-banned phrases (which may not correspond to any voice_lines row),
  // not just disabled seeded/taught lines — otherwise a refresh could re-propose the exact
  // thing the owner already banned via speech_ban.
  const bannedTexts = [...disabled.map(l => l.text), ...rawBanned];

  const categories = ["filler_wait", "ack_quick", "ack_multistep", "confirm_yes_ack", "decline_ack", "reask", "error_generic", "greeting", "thanks_reply", "wake_ack"];

  const prompt = `You are helping Krishna learn the user's speaking style.

The user's recent utterances (their words, mix of English/Hindi/Marathi, formality level):
"""
${utterances.slice(0, 15).join("\n")}
"""

Current phrases Krishna uses per category (the user wants NEW variants in their style):
${categories.map(c => `[${c}]: ${(currentByCategory[c] || []).join(" | ")}`).join("\n")}

Banned phrases (never use these):
${bannedTexts.map(t => `- ${t}`).join("\n")}

For each category above, propose exactly 2 new phrases in the user's register (matching their language mix, formality, and style).
Rules:
- Each phrase must be 2-12 words.
- Each phrase MUST include {honorific} naturally OR work without it.
- Never use any banned phrase or close variant.
- Vary structure: not all should start the same way.
- If the user mixes Hindi/English/Marathi, mirror that mix.
- If the user is formal, be formal; if casual, be casual.

Respond with ONLY a valid JSON object (no other text):
{"proposals": [{"category": "filler_wait", "text": "Just a moment, {honorific}."}, ...]}`;

  const raw = await llmFallback(prompt);
  if (!raw) return { total: 0, categories: [] };

  let parsed: any;
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return { total: 0, categories: [] };
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return { total: 0, categories: [] };
  }

  const proposals: Array<{ category: string; text: string }> = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
  let inserted = 0;
  const insertedCategories = new Set<string>();

  for (const p of proposals) {
    if (!categories.includes(p.category)) continue;
    if (!p.text || p.text.length < 3) continue;
    if (bannedTexts.some(b => p.text.toLowerCase().includes(b.toLowerCase()))) continue;

    const existing = await getAllLinesByCategory(p.category as any);
    const isDup = existing.some(l => l.text.toLowerCase() === p.text.toLowerCase());
    if (isDup) continue;

    // A phrase may legitimately omit the honorific slot entirely (the seeded lines mix
    // both), but it must NEVER hardcode a literal honorific word ("sir"/"boss"/etc.)
    // instead of the {honorific} template — that would permanently ignore the owner's
    // actual honorific setting once approved.
    const hasSlot = p.text.includes("{honorific}");
    const hasHardcodedHonorific = !hasSlot && /\b(sir|boss|ma'?am|madam)\b/i.test(p.text);
    if (hasHardcodedHonorific) continue;

    await insertLine({
      id: crypto.randomUUID(),
      category: p.category as any,
      lang: "en",
      text: p.text,
      source: "llm",
      enabled: 0,
      weight: 1,
      lastUsedAt: null,
      useCount: 0,
      createdAt: Date.now(),
      tod: null,
    });
    inserted++;
    insertedCategories.add(p.category);
  }

  return { total: inserted, categories: Array.from(insertedCategories) };
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

  if (action.action === "travel_best") {
    const to = action.to || "";
    const mode = action.mode || "car";

    if (!to) {
      return { kind: "answer", spokenResponse: "Where would you like to go?" };
    }

    try {
      const result = await suggestDepartureTimeTool.run(
        { from: action.from ?? "home", to, mode, window_hours: String(action.window_hours ?? 3) },
        { vars: {} },
      );

      return {
        kind: "answer",
        spokenResponse: result.success ? (result.output || "I couldn't find a good departure window.") : (result.error || "I couldn't check departure times, sir."),
        ok: result.success,
        errorDetail: result.data?.errorDetail || result.error,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "answer",
        ok: false,
        spokenResponse: "I couldn't check departure times, sir.",
        errorDetail: msg,
      };
    }
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

  if (action.action === "job_queue") {
    try {
      const result = await getJobQueueTool.run({}, { vars: {} });
      return {
        kind: "answer",
        spokenResponse: result.output || "I couldn't check your job queue.",
        ok: result.success,
        errorDetail: result.error || result.data?.errorDetail,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "answer",
        ok: false,
        spokenResponse: "I couldn't check your job queue, sir.",
        errorDetail: msg,
      };
    }
  }

  if (action.action === "job_apply") {
    try {
      const result = await getJobApplyTool.run({}, { vars: {} });
      return {
        kind: "answer",
        spokenResponse: result.output || "I couldn't apply to that job.",
        ok: result.success,
        errorDetail: result.error || result.data?.errorDetail,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "answer",
        ok: false,
        spokenResponse: "I couldn't apply to that job, sir.",
        errorDetail: msg,
      };
    }
  }

  if (action.action === "job_apply_submit") {
    try {
      const result = await getJobApplySubmitTool.run(
        { url: action.url, jobId: action.jobId, title: action.title, company: action.company },
        { vars: {}, preConfirmed: options?.preConfirmed },
      );
      return {
        kind: "answer",
        spokenResponse: result.output || "I couldn't submit the application.",
        ok: result.success,
        errorDetail: result.error || result.data?.errorDetail,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "answer",
        ok: false,
        spokenResponse: "I couldn't submit the application, sir.",
        errorDetail: msg,
      };
    }
  }

  if (action.action === "route_watch") {
    const rawOrigin = action.from || "home";
    const rawDestination = action.to || "";
    const mode = action.mode || "car";

    if (!rawDestination) {
      return { kind: "status", spokenResponse: "Where would you like me to watch?" };
    }

    const origin = await resolvePlace(rawOrigin);
    const destination = await resolvePlace(rawDestination);

    if (origin === rawOrigin && rawOrigin !== "home" && rawOrigin !== "work") {
      return { kind: "status", spokenResponse: `I don't have your ${rawOrigin} address, sir. Tell me and I'll remember it.` };
    }
    if (destination === rawDestination && rawDestination !== "home" && rawDestination !== "work") {
      return { kind: "status", spokenResponse: `I don't have your ${rawDestination} address, sir. Tell me and I'll remember it.` };
    }

    const now = Date.now();
    const defaultThreshold = 40;
    const defaultInterval = 15;
    const windowHours = action.window_hours ?? 4;
    const expiresAt = now + windowHours * 3600000;
    const intervalMinutes = Math.max(10, action.interval_minutes ?? defaultInterval);

    // Cancel any existing active watch (single-active-watch rule)
    const existing = await getActiveRouteWatch();
    if (existing) {
      await cancelRouteWatch(existing.id);
    }

    const id = crypto.randomUUID();
    const watch = await createRouteWatch({
      id,
      origin,
      destination,
      mode,
      threshold_minutes: action.threshold_minutes ?? defaultThreshold,
      interval_minutes: intervalMinutes,
      expires_at: expiresAt,
      last_checked_at: null,
      last_duration_minutes: null,
      consecutive_failures: 0,
      status: "active",
      created_at: now,
    });

    const expiryDate = new Date(expiresAt);
    const expiryTime = expiryDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const spokenResponse = `Watching ${origin} to ${destination}, sir — I'll speak up the moment it drops under ${watch.threshold_minutes} minutes. I'll keep watching until ${expiryTime}.`;

    return {
      kind: "status",
      spokenResponse,
      ok: true,
    };
  }

  if (action.action === "route_watch_cancel") {
    const active = await getActiveRouteWatch();
    if (!active) {
      return { kind: "status", spokenResponse: "There's no active route watch to cancel, sir." };
    }

    await cancelRouteWatch(active.id);
    return { kind: "status", spokenResponse: `Cancelled the route watch from ${active.origin} to ${active.destination}, sir.`, ok: true };
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

  if (action.action === "speech_ban") {
    // Persist the raw phrase regardless of whether it matches a seeded/taught voice_lines
    // row — the owner is usually banning ad-hoc LLM free-form phrasing (V2), not a canned
    // line, so a match-only ban would silently do nothing on the next turn.
    await banPhrase(action.phrase);
    const lines = await getLinesByText(action.phrase);
    for (const line of lines) {
      await disableLine(line.id);
    }
    if (lines.length === 0) {
      return { kind: "status", spokenResponse: `Got it — I'll avoid saying "${action.phrase}" from now on.` };
    }
    return { kind: "status", spokenResponse: `I've stopped saying ${lines.length} phrase${lines.length > 1 ? "s" : ""} like "${action.phrase}".` };
  }

  if (action.action === "speech_teach") {
    let cat: string | null = action.category || null;
    if (cat) {
      const known = ["filler_wait","ack_quick","ack_multistep","confirm_yes_ack","decline_ack","reask","error_generic","error_network","reminder_intro","greeting","thanks_reply","wake_ack"];
      if (!known.includes(cat)) cat = null;
    }
    if (!cat) {
      return { kind: "answer", spokenResponse: `What category should "${action.phrase}" go under? Options are: filler, acknowledgment, greeting, thanks, error, reminder, decline, confirmation, reask, or wake.`, needsConfirmation: false };
    }
    const existing = await getAllLinesByCategory(cat as any);
    const dup = existing.find(l => l.text.toLowerCase() === action.phrase.toLowerCase());
    if (dup) {
      return { kind: "status", spokenResponse: `I already have "${action.phrase}" in my vocabulary.` };
    }
    await insertLine({
      id: crypto.randomUUID(),
      category: cat as any,
      lang: "en",
      text: action.phrase,
      source: "owner",
      enabled: 1,
      weight: 1.5,
      lastUsedAt: null,
      useCount: 0,
      createdAt: Date.now(),
      tod: null,
    });
    return { kind: "status", spokenResponse: `I've added "${action.phrase}" to my vocabulary — I'll use it often.` };
  }

  if (action.action === "speech_refresh") {
    if (!llmFallback) {
      return { kind: "status", spokenResponse: "Can't refresh vocabulary right now — no AI provider configured." };
    }
    try {
      const result = await vocabularyRefresh(llmFallback);
      if (result.total === 0) {
        return { kind: "status", spokenResponse: `I reviewed your conversation style but couldn't generate new phrases that passed quality checks, {honorific}.` };
      }
      const catCount = result.categories.length;
      return { kind: "status", spokenResponse: `I've drafted ${result.total} new phrases from how you talk, across ${catCount} categories. Review them in Settings under Voice & Phrases, or say "accept them" to enable them.` };
    } catch (err) {
      return { kind: "status", spokenResponse: `Vocabulary refresh failed: ${err instanceof Error ? err.message : "unknown error"}` };
    }
  }

  if (action.action === "speech_accept_vocabulary") {
    const count = await enableAllPendingLlmLines();
    if (count === 0) {
      return { kind: "status", spokenResponse: "There's nothing pending to accept right now." };
    }
    return { kind: "status", spokenResponse: `Enabled ${count} new phrase${count > 1 ? "s" : ""}, {honorific} — I'll start using them.` };
  }

  if (action.action === "control_window") {
    // Not confirm-gated (reversible), but the Rust side hard-refuses when the
    // Computer Control toggle is off. The tool's spoken output is the real
    // Win32 result — a zero/ambiguous match returns a disambiguation string,
    // never a fabricated success.
    const result = await controlWindowTool.run(
      { action: action.mode, target: action.target, ...(action.monitor ? { monitor: action.monitor } : {}) },
      { vars: {} },
    );
    return {
      kind: "status",
      spokenResponse: result.success
        ? (result.output || `Done, {honorific}.`)
        : (result.error || "I couldn't do that with the window, sir."),
      ok: result.success,
      errorDetail: result.success ? undefined : result.error,
    };
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

  if (action.action === "route_watch") {
    const from = action.from || "home";
    const to = action.to || "";
    const placeStr = [from, to].filter(Boolean).join(" to ");
    return {
      spokenResponse: `Watch route from ${placeStr}?`,
      needsConfirmation: true,
      pendingResult: {
        found: true,
        displayName: `route_watch: ${placeStr}`,
        target: "",
        actionToResume: JSON.stringify(action),
      } as any,
    };
  }

  return { spokenResponse: "Unknown action" };
}