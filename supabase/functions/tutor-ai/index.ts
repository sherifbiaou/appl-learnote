import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMsg { role: "user" | "assistant"; content: string }

interface QuizContext {
  title?: string;
  questions?: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>;
  answers?: Array<{ questionIndex: number; selectedIndex: number; correct: boolean }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clen = Number(req.headers.get("content-length") || 0);
    if (clen > 2_000_000) {
      return new Response(JSON.stringify({ error: "Payload trop volumineux" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json() as {
      mode: "chat" | "plan" | "sheet";
      messages?: ChatMsg[];
      quiz?: QuizContext;
      focusQuestionIndex?: number;
    };
    if (Array.isArray(body.messages)) {
      body.messages = body.messages.slice(-30).map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content.slice(0, 20_000) : "",
      }));
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build quiz context summary
    let quizSummary = "";
    if (body.quiz?.questions?.length) {
      const total = body.quiz.questions.length;
      const answers = body.quiz.answers || [];
      const score = answers.filter(a => a.correct).length;
      const wrong = answers.filter(a => !a.correct);
      quizSummary = `\n\n=== CONTEXTE DU QUIZ ===\nTitre: ${body.quiz.title || "Quiz"}\nScore: ${score}/${total}\n`;
      if (wrong.length) {
        quizSummary += `\nQuestions ratées:\n` + wrong.map(a => {
          const q = body.quiz!.questions![a.questionIndex];
          return `- Q${a.questionIndex + 1}: ${q.question}\n  Bonne réponse: ${q.options[q.correctIndex]}\n  Explication: ${q.explanation}`;
        }).join("\n");
      }
      if (typeof body.focusQuestionIndex === "number") {
        const q = body.quiz.questions[body.focusQuestionIndex];
        if (q) quizSummary += `\n\nQuestion en focus: ${q.question}\nBonne réponse: ${q.options[q.correctIndex]}`;
      }
    }

    if (body.mode === "chat") {
      const systemPrompt = `Tu es un tuteur IA pédagogique adaptatif en français. Style: commence par expliquer clairement avec exemples et analogies concrètes, PUIS challenge l'utilisateur avec une question de suivi pour vérifier sa compréhension. Sois bienveillant, concis, et utilise du markdown (titres courts, listes, **gras**) pour structurer.${quizSummary}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          stream: true,
          messages: [{ role: "system", content: systemPrompt }, ...(body.messages || [])],
        }),
      });

      if (!response.ok) return handleAIError(response);
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Structured modes: plan + sheet via tool calling
    const isPlan = body.mode === "plan";
    const systemPrompt = isPlan
      ? `Tu es un coach pédagogique. Analyse les erreurs du quiz et crée un plan d'étude personnalisé étape par étape en français. Priorise les sujets les plus mal maîtrisés.${quizSummary}`
      : `Tu es un expert pédagogique. Crée une fiche de révision structurée et synthétique en français à partir du quiz. Couvre tous les sujets, surtout les questions ratées.${quizSummary}`;

    const tools = isPlan ? [{
      type: "function",
      function: {
        name: "build_study_plan",
        description: "Construit un plan d'étude personnalisé",
        parameters: {
          type: "object",
          properties: {
            overview: { type: "string", description: "Diagnostic global en 2 phrases" },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  duration: { type: "string", description: "ex: '15 min'" },
                  objective: { type: "string" },
                  actions: { type: "array", items: { type: "string" } },
                  priority: { type: "string", enum: ["haute", "moyenne", "basse"] },
                },
                required: ["title", "duration", "objective", "actions", "priority"],
                additionalProperties: false,
              },
            },
            tips: { type: "array", items: { type: "string" }, description: "3 conseils de méthode" },
          },
          required: ["overview", "steps", "tips"],
          additionalProperties: false,
        },
      },
    }] : [{
      type: "function",
      function: {
        name: "build_revision_sheet",
        description: "Construit une fiche de révision",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string", description: "Résumé en 3 phrases" },
            keyPoints: { type: "array", items: { type: "string" }, description: "5-8 points clés" },
            definitions: {
              type: "array",
              items: {
                type: "object",
                properties: { term: { type: "string" }, definition: { type: "string" } },
                required: ["term", "definition"],
                additionalProperties: false,
              },
            },
            mnemonics: { type: "array", items: { type: "string" }, description: "Astuces mémo" },
          },
          required: ["title", "summary", "keyPoints", "definitions", "mnemonics"],
          additionalProperties: false,
        },
      },
    }];

    const toolName = isPlan ? "build_study_plan" : "build_revision_sheet";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: isPlan ? "Génère mon plan d'étude personnalisé." : "Génère ma fiche de révision." },
        ],
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!response.ok) return handleAIError(response);

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Réponse AI invalide" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tutor-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleAIError(response: Response) {
  if (response.status === 429) {
    return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans un instant." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (response.status === 402) {
    return new Response(JSON.stringify({ error: "Crédits AI épuisés. Ajoutez des crédits dans Settings → Workspace → Usage." }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const t = await response.text();
  console.error("Gateway error", response.status, t);
  return new Response(JSON.stringify({ error: "Erreur du tuteur IA" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}