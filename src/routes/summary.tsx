import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadSources } from "@/lib/quiz-store";
import type { QuizSource } from "@/lib/quiz-types";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, BookOpen, Sigma, Timer, Sparkles } from "lucide-react";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Résumé des sources — learnote" },
      { name: "description", content: "Obtenez un résumé structuré, des concepts clés et un plan de révision extraits automatiquement par l'IA à partir de vos cours et notes." },
      { property: "og:title", content: "Résumé des sources — learnote" },
      { property: "og:description", content: "Obtenez un résumé structuré, des concepts clés et un plan de révision extraits automatiquement par l'IA à partir de vos cours et notes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://appl-learnote.lovable.app/summary" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Résumé des sources — learnote" },
      { name: "twitter:description", content: "Obtenez un résumé structuré, des concepts clés et un plan de révision extraits automatiquement par l'IA à partir de vos cours et notes." },
    ],
    links: [{ rel: "canonical", href: "https://appl-learnote.lovable.app/summary" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Résumé des sources — learnote",
        description: "Obtenez un résumé structuré, des concepts clés et un plan de révision extraits automatiquement par l'IA à partir de vos cours et notes.",
        url: "https://appl-learnote.lovable.app/summary",
        inLanguage: "fr",
      }),
    }],
  }),
  component: SummaryPage,
});

interface SummarySection { heading: string; summary: string; keyPoints: string[] }
interface SummaryData {
  title: string;
  overview: string;
  sections: SummarySection[];
  keyConcepts: { term: string; definition: string }[];
}

function SummaryPage() {
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setSources(loadSources()); }, []);

  const generate = async () => {
    if (sources.length === 0) { toast.error("Aucune source. Retourne à l'accueil pour en ajouter."); return; }
    setLoading(true);
    try {
      const payload = sources.map((s) => ({ kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType }));
      const { data: res, error } = await supabase.functions.invoke("analyze-sources", {
        body: { mode: "summary", sources: payload },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setData(res as SummaryData);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link to="/" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary">Accueil</Link>
          <Link to="/formulas" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Sigma className="h-4 w-4" /> Formules</Link>
          <Link to="/exam" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Timer className="h-4 w-4" /> Examen</Link>
        </nav>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-20">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3 gap-1"><BookOpen className="h-3 w-3" /> Synthèse IA</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Résumé des sources</h1>
          <p className="mt-2 text-muted-foreground">Une synthèse structurée et hiérarchisée de tout ton contenu, par SmartQuiz.</p>
        </div>

        <Card className="p-6 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "var(--pattern-zigzag)" }} />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{sources.length} source{sources.length > 1 ? "s" : ""} chargée{sources.length > 1 ? "s" : ""}</p>
              {sources.length === 0 && <p className="text-xs mt-1">Va d'abord sur <Link to="/" className="text-primary underline">l'accueil</Link> pour ajouter des ressources.</p>}
            </div>
            <Button onClick={generate} disabled={loading || sources.length === 0} style={{ background: "var(--gradient-gold)" }} className="text-[oklch(0.2_0.02_80)] font-semibold">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</> : <><Sparkles className="h-4 w-4" /> Générer le résumé</>}
            </Button>
          </div>
        </Card>

        {data && (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-3">{data.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{data.overview}</p>
            </Card>

            {data.sections.map((sec, i) => (
              <Card key={i} className="p-6">
                <h3 className="text-lg font-semibold text-primary mb-2">{sec.heading}</h3>
                <p className="text-sm leading-relaxed mb-3">{sec.summary}</p>
                <ul className="space-y-1.5 text-sm">
                  {sec.keyPoints.map((kp, j) => (
                    <li key={j} className="flex gap-2"><span className="text-primary mt-1">▸</span><span>{kp}</span></li>
                  ))}
                </ul>
              </Card>
            ))}

            {data.keyConcepts.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Concepts clés</h3>
                <dl className="space-y-3">
                  {data.keyConcepts.map((kc, i) => (
                    <div key={i} className="border-l-2 border-primary/50 pl-3">
                      <dt className="font-semibold text-primary">{kc.term}</dt>
                      <dd className="text-sm text-muted-foreground">{kc.definition}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}