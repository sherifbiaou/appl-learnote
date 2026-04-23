import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SourcePart {
  kind: "text" | "url" | "image" | "video" | "document" | "video-file" | "websearch";
  label?: string;
  content?: string;
  dataUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

function buildUserContent(sources: SourcePart[]) {
  const userContent: any[] = [];
  const textParts: string[] = [];
  for (const s of sources || []) {
    if (s.kind === "image" && s.dataUrl) {
      userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
    } else if (s.kind === "video-file" && s.dataUrl) {
      userContent.push({ type: "image_url", image_url: { url: s.dataUrl } });
      textParts.push(`[Vidéo locale "${s.label || "vidéo"}" jointe ci-dessus]`);
    } else if (s.kind === "websearch" && s.content) {
      textParts.push(`[Recherche web Google] "${s.content}" — utilise tes connaissances web à jour.`);
    } else if (s.kind === "url" && s.content) {
      textParts.push(`[Lien: ${s.content}] — utilise tes connaissances sur ce site/sujet.`);
    } else if (s.kind === "video" && s.content) {
      textParts.push(`[Vidéo en ligne: ${s.content}]`);
    } else if (s.content) {
      textParts.push(`[${s.label || s.kind}]\n${s.content}`);
    }
  }
  if (textParts.length) userContent.unshift({ type: "text", text: textParts.join("\n\n---\n\n") });
  if (!userContent.length) userContent.push({ type: "text", text: "Aucune source." });
  return userContent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode: "summary" | "formulas" | "websearch" | "demonstrate" = body.mode;
    const sources: SourcePart[] = body.sources || [];
    const formulaLatex: string | undefined = body.formulaLatex;
    const query: string | undefined = body.query;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let tools: any[] = [];
    let toolName = "";
    let userContent: any = buildUserContent(sources);

    if (mode === "summary") {
      systemPrompt = `Tu es Shef AI, un tuteur pédagogique. Analyse les sources fournies et produis un résumé structuré en français, clair et hiérarchisé. Identifie les concepts clés, les définitions importantes et les liens entre les idées.`;
      toolName = "build_summary";
      tools = [{
        type: "function",
        function: {
          name: toolName,
          description: "Construit un résumé structuré des sources",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              overview: { type: "string", description: "Résumé global en 3-5 phrases" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    summary: { type: "string" },
                    keyPoints: { type: "array", items: { type: "string" } },
                  },
                  required: ["heading", "summary", "keyPoints"],
                  additionalProperties: false,
                },
              },
              keyConcepts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    term: { type: "string" },
                    definition: { type: "string" },
                  },
                  required: ["term", "definition"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "overview", "sections", "keyConcepts"],
            additionalProperties: false,
          },
        },
      }];
    } else if (mode === "formulas") {
      systemPrompt = `Tu es Shef AI, expert scientifique. Repère TOUTES les formules présentes dans les sources (mathématiques, physique, chimie, économie, statistiques, code-formule, etc.). Pour chaque formule, écris-la en LaTeX strict (sans $ ni $$, juste le contenu LaTeX), donne son nom, le rôle de chaque symbole, et un exemple d'application.`;
      toolName = "extract_formulas";
      tools = [{
        type: "function",
        function: {
          name: toolName,
          description: "Extrait les formules détectées avec leur LaTeX",
          parameters: {
            type: "object",
            properties: {
              formulas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    discipline: { type: "string", description: "Maths, Physique, Chimie, Économie, etc." },
                    latex: { type: "string", description: "Formule LaTeX, sans délimiteurs $" },
                    description: { type: "string" },
                    symbols: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          symbol: { type: "string" },
                          meaning: { type: "string" },
                        },
                        required: ["symbol", "meaning"],
                        additionalProperties: false,
                      },
                    },
                    example: { type: "string", description: "Exemple d'application concret" },
                  },
                  required: ["name", "discipline", "latex", "description", "symbols", "example"],
                  additionalProperties: false,
                },
              },
            },
            required: ["formulas"],
            additionalProperties: false,
          },
        },
      }];
    } else if (mode === "demonstrate") {
      systemPrompt = `Tu es Shef AI, expert scientifique. Tu vas démontrer pas à pas la formule fournie en LaTeX. Donne une démonstration claire, étape par étape, avec les hypothèses, le raisonnement et la conclusion. Pour chaque étape de calcul, fournis le LaTeX (sans délimiteurs $) ET une explication en français.`;
      toolName = "build_demonstration";
      userContent = [{ type: "text", text: `Formule à démontrer (LaTeX): ${formulaLatex || ""}` }];
      tools = [{
        type: "function",
        function: {
          name: toolName,
          description: "Démontre pas à pas une formule",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              hypotheses: { type: "array", items: { type: "string" } },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    explanation: { type: "string" },
                    latex: { type: "string", description: "Étape mathématique en LaTeX (sans $)" },
                  },
                  required: ["explanation", "latex"],
                  additionalProperties: false,
                },
              },
              conclusion: { type: "string" },
            },
            required: ["title", "hypotheses", "steps", "conclusion"],
            additionalProperties: false,
          },
        },
      }];
    } else if (mode === "websearch") {
      systemPrompt = `Tu es Shef AI, assistant de recherche. L'utilisateur souhaite faire une recherche web (style Google) sur le sujet fourni. À partir de tes connaissances à jour, propose une synthèse de ce qu'on trouverait dans les meilleurs résultats Google: 5 à 8 "résultats" (titre, source/domaine plausible, extrait), suivis d'une synthèse globale. Sois factuel.`;
      toolName = "web_results";
      userContent = [{ type: "text", text: `Requête: ${query || ""}` }];
      tools = [{
        type: "function",
        function: {
          name: toolName,
          description: "Synthèse de recherche web",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    source: { type: "string", description: "Domaine plausible, ex: wikipedia.org" },
                    snippet: { type: "string" },
                  },
                  required: ["title", "source", "snippet"],
                  additionalProperties: false,
                },
              },
              synthesis: { type: "string" },
            },
            required: ["query", "results", "synthesis"],
            additionalProperties: false,
          },
        },
      }];
    } else {
      return new Response(JSON.stringify({ error: "Mode inconnu" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "Erreur IA" }), {
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
    console.error("analyze-sources error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});