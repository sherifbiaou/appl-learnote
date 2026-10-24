import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from "react-katex";
import { supabase } from "@/lib/supabase";
import { loadSources } from "@/lib/quiz-store";
import type { QuizSource } from "@/lib/quiz-types";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sigma, BookOpen, Timer, Sparkles, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/formulas")({
  head: () => ({
    meta: [
      { title: "Formules détectées — learnote" },
      { name: "description", content: "Toutes les formules extraites de vos sources, affichées en LaTeX avec démonstrations pas à pas expliquées par l'IA pour mieux comprendre." },
      { property: "og:title", content: "Formules détectées — learnote" },
      { property: "og:description", content: "Toutes les formules extraites de vos sources, affichées en LaTeX avec démonstrations pas à pas expliquées par l'IA pour mieux comprendre." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://appl-learnote.lovable.app/formulas" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Formules détectées — learnote" },
      { name: "twitter:description", content: "Toutes les formules extraites de vos sources, affichées en LaTeX avec démonstrations pas à pas expliquées par l'IA pour mieux comprendre." },
    ],
    links: [{ rel: "canonical", href: "https://appl-learnote.lovable.app/formulas" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Formules détectées — learnote",
        description: "Toutes les formules extraites de vos sources, affichées en LaTeX avec démonstrations pas à pas expliquées par l'IA pour mieux comprendre.",
        url: "https://appl-learnote.lovable.app/formulas",
        inLanguage: "fr",
      }),
    }],
  }),
  component: FormulasPage,
});

interface Formula {
  name: string;
  discipline: string;
  latex: string;
  description: string;
  symbols: { symbol: string; meaning: string }[];
  example: string;
}
interface Demo {
  title: string;
  hypotheses: string[];
  steps: { explanation: string; latex: string }[];
  conclusion: string;
}

function SafeMath({ tex, block = false }: { tex: string; block?: boolean }) {
  try {
    return block ? <BlockMath math={tex} /> : <InlineMath math={tex} />;
  } catch {
    return <code className="text-xs text-muted-foreground">{tex}</code>;
  }
}

function FormulasPage() {
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [demos, setDemos] = useState<Record<number, Demo | "loading">>({});

  useEffect(() => { setSources(loadSources()); }, []);

  const extract = async () => {
    if (sources.length === 0) { toast.error("Aucune source."); return; }
    setLoading(true);
    try {
      const payload = sources.map((s) => ({ kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType }));
      const { data: res, error } = await supabase.functions.invoke("analyze-sources", {
        body: { mode: "formulas", sources: payload },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setFormulas(res.formulas || []);
      if (!res.formulas?.length) toast.info("Aucune formule détectée dans tes sources.");
    } catch (e: any) { toast.error(e.message || "Erreur"); }
    finally { setLoading(false); }
  };

  const demonstrate = async (i: number, latex: string) => {
    setDemos((d) => ({ ...d, [i]: "loading" }));
    try {
      const { data: res, error } = await supabase.functions.invoke("analyze-sources", {
        body: { mode: "demonstrate", formulaLatex: latex },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setDemos((d) => ({ ...d, [i]: res as Demo }));
    } catch (e: any) {
      toast.error(e.message || "Erreur démonstration");
      setDemos((d) => { const n = { ...d }; delete n[i]; return n; });
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link to="/" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary">Accueil</Link>
          <Link to="/summary" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> Résumé</Link>
          <Link to="/exam" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Timer className="h-4 w-4" /> Examen</Link>
        </nav>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-20">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3 gap-1"><Sigma className="h-3 w-3" /> Recueil & démonstration</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Formules détectées</h1>
          <p className="mt-2 text-muted-foreground">Toutes les formules trouvées dans tes sources, expliquées et démontrables pas à pas.</p>
        </div>

        <Card className="p-6 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "var(--pattern-zigzag)" }} />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{sources.length} source{sources.length > 1 ? "s" : ""}</p>
            <Button onClick={extract} disabled={loading || sources.length === 0} style={{ background: "var(--gradient-gold)" }} className="text-[oklch(0.2_0.02_80)] font-semibold">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyse…</> : <><Sparkles className="h-4 w-4" /> Extraire les formules</>}
            </Button>
          </div>
        </Card>

        {formulas && formulas.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Aucune formule mathématique repérée dans tes sources.</Card>
        )}

        <div className="space-y-6">
          {formulas?.map((f, i) => (
            <Card key={i} className="p-6">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-primary">{f.name}</h3>
                  <Badge variant="outline" className="mt-1 text-xs">{f.discipline}</Badge>
                </div>
              </div>
              <div className="my-4 overflow-x-auto py-3 rounded-lg bg-secondary/50 px-4">
                <SafeMath tex={f.latex} block />
              </div>
              <p className="text-sm leading-relaxed mb-4">{f.description}</p>

              {f.symbols.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Symboles</p>
                  <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                    {f.symbols.map((sy, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs"><SafeMath tex={sy.symbol} /></span>
                        <span className="text-muted-foreground">{sy.meaning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Exemple</p>
                <p className="text-sm">{f.example}</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => demonstrate(i, f.latex)}
                disabled={demos[i] === "loading"}
                className="border-primary/40"
              >
                {demos[i] === "loading" ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Démonstration en cours…</>
                ) : (
                  <><ChevronRight className="h-3 w-3" /> Démontrer pas à pas</>
                )}
              </Button>

              {demos[i] && demos[i] !== "loading" && (() => {
                const d = demos[i] as Demo;
                return (
                  <div className="mt-5 space-y-4 border-t border-primary/20 pt-5">
                    <h4 className="font-semibold text-primary">{d.title}</h4>
                    {d.hypotheses.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Hypothèses</p>
                        <ul className="text-sm space-y-1">{d.hypotheses.map((h, k) => <li key={k}>• {h}</li>)}</ul>
                      </div>
                    )}
                    <ol className="space-y-3 text-sm">
                      {d.steps.map((st, k) => (
                        <li key={k} className="rounded-lg bg-secondary/40 p-3">
                          <div className="flex gap-2 items-start mb-2">
                            <span className="rounded-full bg-primary text-primary-foreground text-xs font-bold w-5 h-5 flex items-center justify-center flex-shrink-0">{k + 1}</span>
                            <p>{st.explanation}</p>
                          </div>
                          <div className="overflow-x-auto pl-7"><SafeMath tex={st.latex} block /></div>
                        </li>
                      ))}
                    </ol>
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Conclusion</p>
                      <p className="text-sm">{d.conclusion}</p>
                    </div>
                  </div>
                );
              })()}
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}