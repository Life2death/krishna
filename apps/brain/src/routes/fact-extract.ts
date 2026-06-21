import type { FastifyInstance } from "fastify";
import {
  getConversationById,
  createMemory,
  fetchAIResponse,
} from "@krishna/core";
import type { BrainContext } from "../context.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";
import { config } from "../config.ts";
import { redactText } from "@krishna/core";

interface FactExtractBody {
  conversationId: string;
  autoSave?: boolean;
}

interface ExtractedFact {
  key: string | null;
  value: string;
}

/**
 * POST /conversations/:id/extract-facts — scan a conversation for factual
 * statements and extract them as candidate memories.
 *
 * The brain decrypts the conversation, sends it to Claude for fact extraction,
 * redacts any PII from the output, and optionally saves the facts as memories.
 */
export function factExtractRoutes(
  app: FastifyInstance,
  ctx: BrainContext
): void {
  app.post(
    "/conversations/:id/extract-facts",
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const { autoSave = false } = (req.body ?? {}) as FactExtractBody;

      if (!config.anthropicApiKey) {
        return reply
          .code(503)
          .send({ error: "ANTHROPIC_API_KEY not configured" });
      }

      const conv = await getConversationById(id);
      if (!conv) {
        return reply.code(404).send({ error: "Conversation not found" });
      }

      // Decrypt messages
      const decrypted = conv.messages.map((m) => ({
        role: m.role,
        content:
          (ctx.crypto.decrypt(m.content as string) ?? m.content) as string,
      }));

      const transcript = decrypted
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const extractionPrompt = [
        "Extract factual statements about the user from this conversation.",
        "Only extract clear, explicit facts (preferences, things they own, personal details, habits).",
        "Do NOT extract questions, greetings, or conversational filler.",
        "Return a JSON array of objects with optional 'key' (short label) and 'value' (the fact).",
        'Example: [{"key": "favorite_color", "value": "blue"}, {"value": "User works at Acme Corp"}]',
        "If no facts are found, return an empty array [].",
        "",
        "Conversation:",
        transcript,
      ].join("\n");

      let fullResponse = "";
      try {
        for await (const chunk of fetchAIResponse({
          provider: claudeProvider,
          selectedProvider: claudeSelectedProvider(),
          systemPrompt:
            "You are a fact extraction system. Output only valid JSON.",
          history: [],
          userMessage: extractionPrompt,
          imagesBase64: [],
        })) {
          fullResponse += chunk;
        }
      } catch (err) {
        return reply.code(502).send({
          error: `Fact extraction failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }

      // Parse JSON from Claude's response
      let facts: ExtractedFact[] = [];
      try {
        const jsonStart = fullResponse.indexOf("[");
        const jsonEnd = fullResponse.lastIndexOf("]");
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(
            fullResponse.slice(jsonStart, jsonEnd + 1)
          );
          facts = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        // JSON parse failed — return raw response
      }

      // Redact PII from extracted facts
      const cleaned: ExtractedFact[] = facts.map((f) => ({
        key: f.key ? redactText(f.key).text : null,
        value: redactText(f.value).text,
      }));

      // Auto-save if requested
      const saved: ExtractedFact[] = [];
      if (autoSave && cleaned.length > 0) {
        for (const fact of cleaned) {
          const memory = {
            id: crypto.randomUUID(),
            key: fact.key ?? null,
            value: ctx.crypto.encrypt(fact.value) as string,
            source: "auto-extract",
            confirmed: 1,
            createdAt: Date.now(),
            lastUsedAt: null,
          };
          await createMemory(memory as any);
          saved.push(fact);
        }
      }

      return {
        facts: cleaned,
        saved: autoSave ? saved : [],
        autoSaved: autoSave,
      };
    }
  );
}
