import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "generate_quiz",
  title: "Generate quiz",
  description:
    "Generate a multiple-choice quiz (4 options per question) from provided text sources using Lovable AI. Returns JSON with title and questions.",
  inputSchema: {
    content: z
      .string()
      .min(20)
      .describe("Raw text content or notes to build the quiz from."),
    questionCount: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(5)
      .describe("Number of questions to generate (3-20)."),
    language: z
      .string()
      .default("fr")
      .describe("Language of the questions (e.g. 'fr', 'en')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ content, questionCount, language }) => {
    // Access-token gate (prevents anonymous cost abuse).
    const requiredToken = process.env.MCP_ACCESS_TOKEN;
    if (!requiredToken) {
      return {
        content: [{ type: "text", text: "MCP access is disabled: MCP_ACCESS_TOKEN is not configured on the server." }],
        isError: true,
      };
    }
    // The mcp-js runtime exposes the bearer via ToolContext.getToken(); we
    // check it via the second handler arg to keep this tool self-contained.
    // If the caller did not send Authorization: Bearer <MCP_ACCESS_TOKEN>, deny.
    // (Second arg is injected by @lovable.dev/mcp-js.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (arguments as any)[1];
    const token: string | undefined = ctx?.getToken?.();
    if (!token || token !== requiredToken) {
      return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
    }
    // Cap content length to bound per-call cost.
    if (content.length > 50_000) content = content.slice(0, 50_000);
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
            content: `You are a pedagogical quiz creator. Produce exactly ${questionCount} MCQ (4 options each) covering the most important aspects. Answer in ${language}. For each question include a short explanation.`,
          },
          { role: "user", content },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "build_quiz",
              description: "Builds the quiz",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correctIndex: { type: "number" },
                        explanation: { type: "string" },
                      },
                      required: ["question", "options", "correctIndex", "explanation"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "build_quiz" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return {
        content: [{ type: "text", text: "No quiz returned by the model." }],
        isError: true,
      };
    }
    const quiz = JSON.parse(toolCall.function.arguments);
    return {
      content: [{ type: "text", text: JSON.stringify(quiz, null, 2) }],
      structuredContent: quiz,
    };
  },
});