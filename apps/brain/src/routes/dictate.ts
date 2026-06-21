import type { FastifyInstance } from "fastify";
import { getHttpFetch } from "@krishna/core";
import { config } from "../config.ts";

interface DictateBody {
  audio: string;
  mimeType?: string;
}

/**
 * POST /dictate — transcribe base64-encoded audio to text using the configured
 * STT provider. Accepts: `{ audio: "<base64>", mimeType?: "audio/webm" }`
 *
 * Configuration (`.env`):
 *   KRISHNA_STT_URL      — the STT API endpoint
 *   KRISHNA_STT_API_KEY  — optional API key (sent as Authorization header)
 *   KRISHNA_STT_MODEL    — optional model name
 */
export function dictateRoutes(app: FastifyInstance): void {
  app.post("/dictate", async (req, reply) => {
    const { audio, mimeType = "audio/webm" } = req.body as DictateBody;

    if (!audio || typeof audio !== "string") {
      return reply.code(400).send({ text: "", error: "audio (base64) is required" });
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(audio, "base64");
    } catch {
      return reply.code(400).send({ text: "", error: "Invalid base64 audio" });
    }

    if (audioBuffer.length === 0) {
      return reply.code(400).send({ text: "", error: "Empty audio" });
    }

    if (!config.sttUrl) {
      return reply.code(503).send({ text: "", error: "STT not configured (KRISHNA_STT_URL)" });
    }

    try {
      const httpFetch = getHttpFetch();

      const headers: Record<string, string> = {};
      if (config.sttApiKey) {
        headers["Authorization"] = `Bearer ${config.sttApiKey}`;
      }

      const form = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      const ext = mimeType.split("/")[1] ?? "webm";
      form.append("audio", blob, `audio.${ext}`);
      if (config.sttModel) {
        form.append("model", config.sttModel);
      }

      const response = await httpFetch(config.sttUrl, {
        method: "POST",
        headers,
        body: form,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        return reply.code(502).send({ text: "", error: `STT provider error: ${errText}` });
      }

      const data = await response.json();
      const text =
        data.text ??
        data.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        data.transcript ??
        JSON.stringify(data);

      return { text };
    } catch (err) {
      return reply.code(500).send({
        text: "",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
