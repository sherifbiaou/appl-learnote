import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ListChecks, BookOpen } from "lucide-react";
import { loadSession } from "@/lib/quiz-store";
import { toast } from "sonner";

const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutor-ai`;

interface PlanStep { title: string; duration: string; objective: string; actions: string[]; priority: "haute" | "moyenne" | "basse" }
interface Plan { overview: string; steps: PlanStep[]; tips: string[] }

interface Sheet {
  title: string;
  summary: string;
  keyPoints: string[];
  definitions: { term: string; definition: string }[];
  mnemonics: string[];
}

export function StudyPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);

  const generate = async (mode: "plan" | "sheet") => {
    const session = loadSession();
    if (!session) return;
    const setLoad = mode === "plan" ? setLoadingPlan : setLoadingSheet;
    setLoad(true);
    try {
      const resp = await fetch(URL_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          quiz: { title: session.quiz.title, questions: session.quiz.questions, answers: session.answers },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast.error(data.error || "Erreur"); return; }
      if (mode === "plan") setPlan(data); else setSheet(data);
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau");
    } finally {
      setLoad(false);
    }
  };

  const priorityColor = (p: string) =>
    p === "haute" ? "bg-destructive/10 text-destructive" :
    p === "moyenne" ? "bg-primary/10 text-primary" :
    "bg-muted text-muted-foreground";

  return (
    <section className="mt-10 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          onClick={() => generate("plan")}
          disabled={loadingPlan}
          variant="outline"
          size="lg"
          className="h-auto py-4 flex-col items-start gap-1"
        >
          <div className="flex items-center gap-2 font-semibold">
            {loadingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Plan d'étude personnalisé
          </div>
          <span className="text-xs text-muted-foreground font-normal">Étapes priorisées par l'IA</span>
        </Button>
        <Button
          onClick={() => generate("sheet")}
          disabled={loadingSheet}
          variant="outline"
          size="lg"
          className="h-auto py-4 flex-col items-start gap-1"
        >
          <div className="flex items-center gap-2 font-semibold">
            {loadingSheet ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            Fiche de révision
          </div>
          <span className="text-xs text-muted-foreground font-normal">Synthèse + définitions + mnémos</span>
        </Button>
      </div>

      {plan && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /> Plan d'étude</h3>
            <p className="text-sm text-muted-foreground mt-1">{plan.overview}</p>
          </div>
          <ol className="space-y-3">
            {plan.steps.map((s, i) => (
              <li key={i} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-semibold">{i + 1}. {s.title}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor(s.priority)}`}>{s.priority}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">⏱ {s.duration} · 🎯 {s.objective}</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {s.actions.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              </li>
            ))}
          </ol>
          {plan.tips.length > 0 && (
            <div className="rounded-xl bg-secondary/60 p-4">
              <p className="text-xs uppercase tracking-wide font-semibold mb-2">Conseils méthode</p>
              <ul className="text-sm space-y-1 list-disc pl-5">
                {plan.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {sheet && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> {sheet.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{sheet.summary}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold mb-2">Points clés</p>
            <ul className="text-sm space-y-1 list-disc pl-5">
              {sheet.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          {sheet.definitions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold mb-2">Définitions</p>
              <dl className="text-sm space-y-2">
                {sheet.definitions.map((d, i) => (
                  <div key={i} className="rounded-lg bg-secondary/40 p-3">
                    <dt className="font-semibold">{d.term}</dt>
                    <dd className="text-muted-foreground">{d.definition}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {sheet.mnemonics.length > 0 && (
            <div className="rounded-xl bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide font-semibold mb-2">💡 Astuces mémo</p>
              <ul className="text-sm space-y-1 list-disc pl-5">
                {sheet.mnemonics.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}