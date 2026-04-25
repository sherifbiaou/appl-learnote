import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SourcePart {
  kind: string;
  label?: string;
  content?: string;
  dataUrl?: string;
  mimeType?: string;
}

function buildSourceText(sources: SourcePart[]): string {
  if (!sources?.length) return "";
  return sources
    .map((s, i) => {
      const head = `[Source ${i + 1} • ${s.kind}${s.label ? ` • ${s.label}` : ""}]`;
      const body = s.content?.slice(0, 4000) ?? (s.dataUrl ? "(fichier média)" : "");
      return `${head}\n${body}`;
    })
    .join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, sources = [], prompt = "", aspect = "1:1", style = "" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");

    const sourceText = buildSourceText(sources as SourcePart[]);

    // ===== IMAGE / COMIC : Nano Banana =====
    if (mode === "image" || mode === "comic") {
      let fullPrompt = "";
      if (mode === "image") {
        fullPrompt =
          `Crée une illustration pédagogique claire et lisible (format ${aspect}). ` +
          `Style: ${style || "infographique moderne, lignes nettes, couleurs vives mais sobres"}. ` +
          `Sujet: ${prompt}. ` +
          (sourceText ? `\nContexte des sources de l'utilisateur:\n${sourceText}` : "") +
          `\nInclure des labels courts si utile à la compréhension. Pas de texte long.`;
      } else {
        fullPrompt =
          `Crée une bande dessinée pédagogique en 4 cases (grille 2x2), format ${aspect}, ` +
          `pour expliquer la notion: ${prompt}. ` +
          `Style: ${style || "BD ligne claire, couleurs douces, personnages expressifs"}. ` +
          `Chaque case avec une bulle courte qui fait progresser l'explication. Texte en français, lisible.` +
          (sourceText ? `\nBase-toi sur ces sources:\n${sourceText}` : "");
      }

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!r.ok) {
        if (r.status === 429) return new Response(JSON.stringify({ error: "Limite atteinte, réessaie dans un instant." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (r.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés. Ajoute du crédit dans ton workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await r.text();
        throw new Error(`AI gateway image error ${r.status}: ${t.slice(0, 200)}`);
      }
      const data = await r.json();
      const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) throw new Error("Aucune image renvoyée par le modèle");
      return new Response(JSON.stringify({ imageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== CHART / TABLE : structured JSON via tool calling =====
    const isChart = mode === "chart";
    const isTable = mode === "table";
    if (!isChart && !isTable) throw new Error(`Mode inconnu: ${mode}`);

    const systemPrompt = isChart
      ? `Tu es un expert pédagogue. À partir des sources et de la demande, conçois un graphique pertinent (bar, line, pie ou area) qui aide à comprendre la notion. Données réalistes ou tirées des sources. Tout en français.`
      : `Tu es un expert pédagogue. Construis un tableau comparatif clair et utile à la compréhension, à partir des sources et de la demande. En français.`;

    const userMsg =
      `Demande: ${prompt}\n` +
      (sourceText ? `\nSources:\n${sourceText}` : "");

    const tools = isChart
      ? [{
          type: "function",
          function: {
            name: "build_chart",
            description: "Renvoie une spec de graphique pédagogique",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                chartType: { type: "string", enum: ["bar", "line", "pie", "area"] },
                xKey: { type: "string", description: "Nom de la clé pour l'axe X / catégorie" },
                series: {
                  type: "array",
                  description: "Une ou plusieurs séries de données",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      dataKey: { type: "string" },
                    },
                    required: ["name", "dataKey"],
                    additionalProperties: false,
                  },
                },
                data: {
                  type: "array",
                  description: "Lignes de données. Chaque objet contient xKey + dataKey de chaque série (nombre).",
                  items: { type: "object", additionalProperties: true },
                },
                insight: { type: "string", description: "Phrase d'insight pédagogique" },
              },
              required: ["title", "chartType", "xKey", "series", "data", "insight"],
              additionalProperties: false,
            },
          },
        }]
      : [{
          type: "function",
          function: {
            name: "build_table",
            description: "Renvoie un tableau comparatif",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                columns: { type: "array", items: { type: "string" }, minItems: 2 },
                rows: {
                  type: "array",
                  items: { type: "array", items: { type: "string" } },
                },
                insight: { type: "string" },
              },
              required: ["title", "columns", "rows", "insight"],
              additionalProperties: false,
            },
          },
        }];

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        tools,
        tool_choice: { type: "function", function: { name: isChart ? "build_chart" : "build_table" } },
      }),
    });

    if (!r.ok) {
      if (r.status === 429) return new Response(JSON.stringify({ error: "Limite atteinte, réessaie dans un instant." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await r.text();
      throw new Error(`AI gateway error ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Pas de réponse structurée du modèle");
    const parsed = JSON.parse(args);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("visual-studio error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
