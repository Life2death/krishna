import type { FastifyInstance } from "fastify";
import { createSkill, fetchAIResponse } from "@krishna/core";
import type { Skill } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";
import { config } from "../config.ts";

interface GenerateRequest {
  description: string;
}

/**
 * POST /skills/generate — turn a natural-language description into a
 * declarative skill recipe using Claude, validate it, and persist it.
 *
 * The LLM emits JSON matching the Skill type's planTemplate + triggerExamples
 * fields. No arbitrary code-gen — the recipe is validated before storage.
 */
export function skillsGenerateRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.post("/skills/generate", async (req, reply) => {
    const { description } = req.body as GenerateRequest;

    if (!description || typeof description !== "string" || !description.trim()) {
      return reply.code(400).send({ error: "description is required" });
    }

    if (!config.anthropicApiKey) {
      return reply.code(503).send({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const generatePrompt = [
      "You are a skill generator. Given a user request, produce a declarative skill recipe.",
      "",
      "The Skill type has these fields:",
      "- triggerExamples: a short example of what the user says to invoke this skill, e.g. \"search {query} on youtube\"",
      "- params: JSON array of parameter names, e.g. [\"query\"]",
      "- planTemplate: JSON array of step objects. Each step has:",
      "    { \"tool\": \"<tool_name>\", \"args\": { \"<key>\": \"<value or ${param}>\" }, \"out\": \"<optional_var>\" }",
      "",
      "Available tools:",
      "- open_target: opens a URL/app. Args: { target }",
      "- youtube_search: searches YouTube. Args: { query }, out: url",
      "- web_search: returns a Google search URL. Args: { query }",
      "",
      "Rules:",
      "1. Use ${paramName} for parameter placeholders in args and triggerExamples.",
      "2. triggerExamples should be a natural phrase the user would say.",
      "3. params must list every {paramName} used in the template.",
      "4. For multi-step plans, use 'out' to pipe data between steps.",
      "5. NEVER include sensitive operations like file deletion without user confirmation.",
      "6. NEVER generate code — only declarative tool-call JSON.",
      "",
      "Respond with ONLY valid JSON — no explanation, no markdown:",
      '{',
      '  "triggerExamples": "search {query} on youtube",',
      '  "params": ["query"],',
      '  "planTemplate": [',
      '    { "tool": "youtube_search", "args": { "query": "${query}" }, "out": "url" },',
      '    { "tool": "open_target", "args": { "target": "${url}" } }',
      '  ]',
      '}',
      "",
      `User request: ${description}`,
    ].join("\n");

    let fullResponse = "";
    try {
      for await (const chunk of fetchAIResponse({
        provider: claudeProvider,
        selectedProvider: claudeSelectedProvider(),
        systemPrompt: "You are a precise JSON generator. Output only valid JSON.",
        history: [],
        userMessage: generatePrompt,
        imagesBase64: [],
      })) {
        fullResponse += chunk;
      }
    } catch (err) {
      return reply.code(502).send({
        error: `Skill generation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Parse JSON from Claude's response
    let recipe: { triggerExamples?: string; params?: string[]; planTemplate?: unknown[] };
    try {
      const jsonStart = fullResponse.indexOf("{");
      const jsonEnd = fullResponse.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd <= jsonStart) {
        return reply.code(502).send({ error: "LLM returned no valid JSON" });
      }
      recipe = JSON.parse(fullResponse.slice(jsonStart, jsonEnd + 1));
    } catch {
      return reply.code(502).send({ error: "Failed to parse LLM response as JSON" });
    }

    // Validate required fields
    if (!recipe.triggerExamples || !recipe.params || !recipe.planTemplate) {
      return reply.code(422).send({
        error: "Generated skill is missing required fields",
        recipe,
      });
    }
    if (!Array.isArray(recipe.params) || recipe.params.length === 0) {
      return reply.code(422).send({ error: "params must be a non-empty array", recipe });
    }
    if (!Array.isArray(recipe.planTemplate) || recipe.planTemplate.length === 0) {
      return reply.code(422).send({ error: "planTemplate must be a non-empty array", recipe });
    }

    const paramStr = JSON.stringify(recipe.params);
    const planStr = JSON.stringify(recipe.planTemplate);

    // Derive a name from triggerExamples
    const name = recipe.triggerExamples
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-");

    const now = Date.now();
    const skill: Skill = {
      id: now,
      name,
      triggerExamples: recipe.triggerExamples,
      params: paramStr,
      planTemplate: planStr,
      confirmedByUser: 0,
      useCount: 0,
      createdAt: now,
    };

    const saved = await createSkill(skill);
    ctx.hub.broadcast("skills", "create", saved);

    return saved;
  });
}
