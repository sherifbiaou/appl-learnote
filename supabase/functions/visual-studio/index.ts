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

interface Theme {
  palette?: string;
  font?: string;
  vibe?: string;
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

function themeToText(theme?: Theme): string {
  if (!theme) return "";
  const parts = [];
  if (theme.palette) parts.push(`palette: ${theme.palette}`);
  if (theme.font) parts.push(`typographie: ${theme.font}`);
  if (theme.vibe) parts.push(`ambiance: ${theme.vibe}`);
  return parts.length ? `Thème visuel imposé — ${parts.join(", ")}.` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clen = Number(req.headers.get("content-length") || 0);
    if (clen > 8_000_000) {
      return new Response(JSON.stringify({ error: "Payload trop volumineux" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      mode,
      sources = [],
      prompt = "",
      aspect = "1:1",
      style = "",
      theme,
      scenario,            // optional pre-validated comic scenario (string)
      requireCitations,    // boolean for chart/table
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");

    const sourceText = buildSourceText(sources as SourcePart[]);
    const themeText = themeToText(theme as Theme | undefined);

    // ===== COMIC SCENARIO (text-only, before image) =====
    if (mode === "comic-scenario") {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tu es scénariste de BD pédagogique. Tu écris en français." },
            { role: "user", content: `Construis un scénario de BD pédagogique en 4 cases (grille 2x2) pour expliquer: ${prompt}.\n${themeText}\n${sourceText ? `Sources:\n${sourceText}` : ""}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "build_scenario",
              description: "Renvoie un scénario de BD en 4 cases",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  panels: {
                    type: "array",
                    minItems: 4, maxItems: 4,
                    items: {
                      type: "object",
                      properties: {
                        scene: { type: "string", description: "Description visuelle de la case" },
                        bubble: { type: "string", description: "Texte court dans la bulle (max 80 caractères)" },
                      },
                      required: ["scene", "bubble"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "panels"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "build_scenario" } },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`AI gateway scenario error ${r.status}: ${t.slice(0, 200)}`);
      }
      const data = await r.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("Pas de scénario renvoyé");
      return new Response(args, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== IMAGE / COMIC : Nano Banana =====
    if (mode === "image" || mode === "comic") {
      let fullPrompt = "";
      if (mode === "image") {
        fullPrompt =
          `Crée une illustration pédagogique claire et lisible (format ${aspect}). ` +
          `Style: ${style || "infographique moderne, lignes nettes, couleurs vives mais sobres"}. ` +
          (themeText ? `${themeText} ` : "") +
          `Sujet: ${prompt}. ` +
          (sourceText ? `\nContexte des sources de l'utilisateur:\n${sourceText}` : "") +
          `\nInclure des labels courts si utile à la compréhension. Pas de texte long.`;
      } else {
        const scenarioText = scenario ? `\nScénario validé à respecter strictement (4 cases, ordre haut-gauche, haut-droite, bas-gauche, bas-droite):\n${scenario}` : "";
        fullPrompt =
          `Crée une bande dessinée pédagogique en 4 cases (grille 2x2), format ${aspect}, ` +
          `pour expliquer la notion: ${prompt}. ` +
          `Style: ${style || "BD ligne claire, couleurs douces, personnages expressifs"}. ` +
          (themeText ? `${themeText} ` : "") +
          `Chaque case avec une bulle courte qui fait progresser l'explication. Texte en français, lisible.` +
          scenarioText +
          (sourceText && !scenario ? `\nBase-toi sur ces sources:\n${sourceText}` : "");
      }

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!r.ok) {
        if (r.status === 429) return new Response(JSON.stringify({ error: "Limite atteinte, réessaie dans un instant." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (r.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await r.text();
        throw new Error(`AI gateway image error ${r.status}: ${t.slice(0, 200)}`);
      }
      const data = await r.json();
      const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) throw new Error("Aucune image renvoyée par le modèle");
      return new Response(JSON.stringify({ imageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== CHART / TABLE =====
    const isChart = mode === "chart";
    const isTable = mode === "table";
    if (!isChart && !isTable) throw new Error(`Mode inconnu: ${mode}`);

    const citationsRule = requireCitations
      ? `OBLIGATION: pour chaque ligne/série, indique dans le champ "citations" la source précise utilisée (ex. "Source 2 — section Photosynthèse"). Si la donnée n'est pas dans les sources, écris "estimation pédagogique" et explique pourquoi.`
      : "";

    const systemPrompt = isChart
      ? `Tu es un expert pédagogue. À partir des sources et de la demande, conçois un graphique pertinent (bar, line, pie ou area). Données réalistes ou tirées des sources. ${themeText} ${citationsRule} Tout en français.`
      : `Tu es un expert pédagogue. Construis un tableau comparatif clair, à partir des sources et de la demande. ${themeText} ${citationsRule} En français.`;

    const userMsg = `Demande: ${prompt}\n` + (sourceText ? `\nSources:\n${sourceText}` : "");

    const chartProps: Record<string, unknown> = {
      title: { type: "string" },
      description: { type: "string" },
      chartType: { type: "string", enum: ["bar", "line", "pie", "area"] },
      xKey: { type: "string" },
      series: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, dataKey: { type: "string" } },
          required: ["name", "dataKey"], additionalProperties: false,
        },
      },
      data: { type: "array", items: { type: "object", additionalProperties: true } },
      insight: { type: "string" },
    };
    const chartRequired = ["title", "chartType", "xKey", "series", "data", "insight"];
    if (requireCitations) {
      chartProps.citations = { type: "array", items: { type: "string" }, description: "Source/section pour chaque série ou point clé" };
      chartRequired.push("citations");
    }

    const tableProps: Record<string, unknown> = {
      title: { type: "string" },
      description: { type: "string" },
      columns: { type: "array", items: { type: "string" }, minItems: 2 },
      rows: { type: "array", items: { type: "array", items: { type: "string" } } },
      insight: { type: "string" },
    };
    const tableRequired = ["title", "columns", "rows", "insight"];
    if (requireCitations) {
      tableProps.citations = { type: "array", items: { type: "string" }, description: "Source/section pour chaque ligne du tableau" };
      tableRequired.push("citations");
    }

    const tools = isChart
      ? [{ type: "function", function: { name: "build_chart", description: "Spec de graphique", parameters: { type: "object", properties: chartProps, required: chartRequired, additionalProperties: false } } }]
      : [{ type: "function", function: { name: "build_table", description: "Tableau comparatif", parameters: { type: "object", properties: tableProps, required: tableRequired, additionalProperties: false } } }];

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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
