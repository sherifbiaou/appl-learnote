import { defineMcp } from "@lovable.dev/mcp-js";
import generateQuizTool from "./tools/generate-quiz";
import summarizeNotesTool from "./tools/summarize-notes";

export default defineMcp({
  name: "appquiz-mcp",
  title: "appQuiz MCP",
  version: "0.1.0",
  instructions:
    "Tools for appQuiz: generate multiple-choice quizzes from source text and summarize study notes.",
  tools: [generateQuizTool, summarizeNotesTool],
});