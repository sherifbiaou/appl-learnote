import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "summarize_notes",
  title: "Summarize notes",
  description:
    "Produce a concise study summary (key points, definitions) from raw text using Lovable AI.",
  inputSchema: {
    content: z.string().min(20).describe("Notes or source text to summarize."),
    language: z.string().default("fr").describe("Output language (e.g. 'fr', 'en')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ content, language }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        content: [{ type: "text", text: "LOVABLE_API_KEY is not configured." }],
        isError: true,
      };
    }
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a study assistant. Produce a concise structured summary with key points, definitions, and formulas. Answer in ${language}. Use markdown.`,
          },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        content: [{ type: "text", text: `AI gateway error ${res.status}: ${text}` }],
        isError: true,
      };
    }
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content ?? "";
    return { content: [{ type: "text", text: summary }] };
  },
});