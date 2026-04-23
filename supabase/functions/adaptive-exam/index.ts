import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SourcePart {
  kind: string;
  label?: string;
  content?: string;
  dataUrl?: string;
}

interface PrevAnswer {
  question: string;
  difficulty: number; // 1-5
  correct: boolean;
}

function buildUserContent(sources: SourcePart[]) {
  const userContent: any[] = [];
  const textParts: string[] = [];
  for (const s of sources || []) {
    if (s.kind === "image" && s.dataUrl) {
      userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
    } else if (s.kind === "video-file" && s.dataUrl) {
      userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
    } else if (s.kind === "websearch" && s.content) {
      textParts.push(`[Recherche web] ${s.content}`);
    } else if (s.kind === "url" && s.content) {
      textParts.push(`[Lien] ${s.content}`);
    } else if (s.kind === "video" && s.content) {
      textParts.push(`[Vidéo en ligne] ${s.content}`);
    } else if (s.content) {
      textParts.push(`[${s.label || s.kind}]\n${s.content}`);
    }
  }
  if (textParts.length) userContent.unshift({ type: "text", text: textParts.join("\n\n---\n\n") });
  if (!userContent.length) userContent.push({ type: "text", text: "Sources non fournies." });
  return userContent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sources: SourcePart[] = body.sources || [];
    const previous: PrevAnswer[] = body.previous || [];
    const targetDifficulty: number = body.targetDifficulty || 3;
    const questionIndex: number = body.questionIndex || 0;
    const totalQuestions: number = body.totalQuestions || 10;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const history = previous.length
      ? previous.map((p, i) => `Q${i + 1} (diff ${p.difficulty}/5): ${p.correct ? "✓" : "✗"} — "${p.question.slice(0, 80)}"`).join("\n")
      : "(aucune)";

    const systemPrompt = `Tu es Shef AI, examinateur adaptatif. Tu génères une SEULE question à choix multiples (4 options) basée sur les sources, avec une difficulté ciblée de ${targetDifficulty}/5 (1=très facile, 5=expert). C'est la question ${questionIndex + 1}/${totalQuestions} de l'examen. Évite les répétitions avec l'historique. Difficulté: 1=définition simple, 2=fait précis, 3=concept appliqué, 4=analyse multi-concepts, 5=cas complexe ou piège subtil. Réponds en français.\n\nHistorique des réponses:\n${history}`;

    const userContent = buildUserContent(sources);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "next_question",
            description: "Génère la prochaine question d'examen",
            parameters: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                correctIndex: { type: "number" },
                explanation: { type: "string" },
                difficulty: { type: "number", description: "Difficulté réelle 1-5" },
                topic: { type: "string" },
              },
              required: ["question", "options", "correctIndex", "explanation", "difficulty", "topic"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "next_question" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Crédits AI épuisés" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("adaptive-exam gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "Erreur IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return new Response(JSON.stringify({ error: "Réponse invalide" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(args), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("adaptive-exam error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});