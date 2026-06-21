import type { FastifyInstance } from "fastify";
import { getConversationById, fetchAIResponse, redactText } from "@krishna/core";
import type { Message } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";
import { config } from "../config.ts";

interface ResumeSummaryResult {
  summary: string;
  recentTurns: Message[];
  suggestedActions: string[];
  conversationId: string;
}

/**
 * POST /conversations/:id/resume-summary
 *
 * Returns a compact digest of the conversation for cross-device handoff.
 * The brain fetches the conversation, decrypts it, and asks Claude to produce:
 *   - A rolling summary of older turns
 *   - Recent turns (last 4 messages)
 *   - Suggested next-actions/skills
 *
 * Secrets/PII are redacted by the LLM prompt (the brain never stores plaintext
 * secrets in conversations, but the prompt explicitly instructs redaction).
 */
export function resumeSummaryRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.post("/conversations/:id/resume-summary", async (req, reply) => {
    const id = (req.params as { id: string }).id;

    if (!config.anthropicApiKey) {
      return reply.code(503).send({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const conv = await getConversationById(id);
    if (!conv) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    // Decrypt messages (they're encrypted at rest in the brain)
    const messages: Message[] = conv.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: ctx.crypto.decrypt(m.content) as string,
    }));

    const recentTurns = messages.slice(-4);
    const olderContent = messages.slice(0, -4);

    // Build a summary prompt for Claude
    const historyBlock = olderContent
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const summaryPrompt = [
      "Summarize this conversation for a user who is resuming on another device.",
      "Keep it concise (3-5 sentences).",
      `Recent messages:\n${recentTurns.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
      historyBlock ? `\nEarlier context:\n${historyBlock}` : "",
      "\n---",
      "Then suggest 1-3 likely next actions the user might want to take.",
      "Redact any personally identifiable information (API keys, passwords, etc.).",
      "\nRespond in JSON format:",
      '{ "summary": "...", "suggestedActions": ["..."] }',
    ].join("\n");

    let fullResponse = "";
    try {
      for await (const chunk of fetchAIResponse({
        provider: claudeProvider,
        selectedProvider: claudeSelectedProvider(),
        systemPrompt: "You are a conversation summarizer. Output only valid JSON.",
        history: [],
        userMessage: summaryPrompt,
        imagesBase64: [],
      })) {
        fullResponse += chunk;
      }
    } catch (err) {
      return reply.code(502).send({
        error: `Summary generation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Parse JSON from Claude's response
    let parsed: { summary?: string; suggestedActions?: string[] } = {};
    try {
      const jsonStart = fullResponse.indexOf("{");
      const jsonEnd = fullResponse.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        parsed = JSON.parse(fullResponse.slice(jsonStart, jsonEnd + 1));
      }
    } catch {
      // If JSON parsing fails, use raw text as summary
    }

    // Redact any PII that the LLM prompt didn't catch
    const redactedSummary = parsed.summary ? redactText(parsed.summary).text : (fullResponse.trim().split("\n")[0] || "No summary available.");

    const result: ResumeSummaryResult = {
      summary: redactedSummary,
      recentTurns,
      suggestedActions: (parsed.suggestedActions || []).map((a) => redactText(a).text),
      conversationId: id,
    };

    return result;
  });
}
