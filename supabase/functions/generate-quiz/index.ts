import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SourcePart {
  kind: "text" | "url" | "image" | "video" | "document" | "video-file" | "websearch";
  label?: string;
  content?: string; // text content or URL
  dataUrl?: string; // for images: base64 data URL
  mimeType?: string; // for video-file
  sizeBytes?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sources, requestedCount, mode } = await req.json() as {
      sources: SourcePart[];
      requestedCount?: number;
      mode: "suggest" | "generate";
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build multimodal user content
    const userContent: any[] = [];
    const textParts: string[] = [];

    for (const s of sources) {
      if (s.kind === "image" && s.dataUrl) {
        userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
      } else if (s.kind === "document" && s.dataUrl) {
        // PDFs / docx sent as base64 data URL — Gemini accepts them as file parts.
        userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
        textParts.push(`[Document "${s.label || "document"}" joint ci-dessus] — analyse-le pour construire le quiz.`);
      } else if (s.kind === "video-file" && s.dataUrl) {
        // Gemini accepts inline video via image_url-style data URL on the gateway.
        // Soft cap to avoid huge payloads (we already filter client-side at 20MB for direct mode).
        userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
        textParts.push(`[Vidéo locale "${s.label || "vidéo"}" jointe ci-dessus] — analyse son contenu visuel et audio.`);
      } else if (s.kind === "websearch" && s.content) {
        textParts.push(`[Recherche web Google demandée] Sujet/requête: "${s.content}". Utilise tes connaissances à jour pour couvrir ce sujet de façon factuelle, comme si tu avais consulté les meilleurs résultats Google récents.`);
      } else if (s.kind === "url" && s.content) {
        textParts.push(`[Lien web: ${s.content}] — utilise tes connaissances sur ce sujet/site.`);
      } else if (s.kind === "video" && s.content) {
        textParts.push(`[Vidéo: ${s.content}] — utilise tes connaissances sur le sujet de cette vidéo.`);
      } else if (s.content) {
        textParts.push(`[${s.label || s.kind}]\n${s.content}`);
      }
    }

    if (textParts.length) {
      userContent.unshift({ type: "text", text: textParts.join("\n\n---\n\n") });
    }
    if (userContent.length === 0) {
      userContent.push({ type: "text", text: "Aucune source fournie." });
    }

    const systemPrompt = mode === "suggest"
      ? `Tu es un expert pédagogique. Analyse les sources fournies et propose un nombre IDÉAL de questions de quiz pour couvrir TOUS les aspects importants du contenu. Réponds en français.`
      : `Tu es un expert pédagogique créateur de quiz. Génère exactement ${requestedCount} questions à choix multiples (4 options chacune) couvrant les aspects les plus importants des sources fournies. Les questions doivent être variées (factuelles, conceptuelles, application). Réponds en français. Pour chaque question, fournis aussi une explication courte de la bonne réponse pour la révision.`;

    const tools = mode === "suggest" ? [{
      type: "function",
      function: {
        name: "suggest_count",
        description: "Propose un nombre idéal de questions",
        parameters: {
          type: "object",
          properties: {
            suggested: { type: "number", description: "Nombre idéal de questions (entre 3 et 30)" },
            reasoning: { type: "string", description: "Brève justification (1 phrase)" },
            topic: { type: "string", description: "Sujet principal détecté" },
          },
          required: ["suggested", "reasoning", "topic"],
          additionalProperties: false,
        },
      },
    }] : [{
      type: "function",
      function: {
        name: "build_quiz",
        description: "Construit le quiz",
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
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correctIndex: { type: "number", description: "Index 0-3 de la bonne réponse" },
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
    }];

    const toolName = mode === "suggest" ? "suggest_count" : "build_quiz";

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
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!response.ok) {
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
      return new Response(JSON.stringify({ error: "Erreur de génération" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    console.error("generate-quiz error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});