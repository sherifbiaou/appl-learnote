import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brand } from "@/components/Brand";
import { clearSession, loadSession } from "@/lib/quiz-store";
import type { QuizSession } from "@/lib/quiz-types";
import { Check, X, Trophy, RotateCcw, Home } from "lucide-react";
import { StudyPlan } from "@/components/StudyPlan";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Résultats du quiz — learnote" },
      { name: "description", content: "Consultez votre score, révisez vos erreurs et obtenez un plan d'étude personnalisé généré par l'IA pour progresser sur learnote." },
      { property: "og:title", content: "Résultats du quiz — learnote" },
      { property: "og:description", content: "Consultez votre score, révisez vos erreurs et obtenez un plan d'étude personnalisé généré par l'IA pour progresser sur learnote." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://appl-learnote.lovable.app/results" },
    ],
    links: [{ rel: "canonical", href: "https://appl-learnote.lovable.app/results" }],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s || s.answers.length === 0) {
      navigate({ to: "/" });
      return;
    }
    setSession(s);
  }, [navigate]);

  if (!session) return null;

  const total = session.quiz.questions.length;
  const score = session.answers.filter((a) => a.correct).length;
  const pct = Math.round((score / total) * 100);
  const wrong = session.answers.filter((a) => !a.correct);

  const verdict =
    pct >= 90 ? "Champion !" :
    pct >= 70 ? "Excellent" :
    pct >= 50 ? "Bon travail" : "À retravailler";

  const restart = () => {
    clearSession();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
      </header>

      <main className="container mx-auto px-6 pb-20">
        <div className="mx-auto max-w-2xl">
          <Card className="p-8 text-center shadow-[var(--shadow-soft)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--gradient-hero)" }}>
              <Trophy className="h-8 w-8 text-primary-foreground" />
            </div>
            <p className="text-sm uppercase tracking-wider text-muted-foreground">{verdict}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Résultats du quiz</h1>
            <p className="mt-2 text-5xl font-bold tracking-tight">
              {score}<span className="text-muted-foreground">/{total}</span>
            </p>
            <p className="mt-2 text-2xl font-semibold text-primary">{pct}%</p>
            <p className="mt-2 text-sm text-muted-foreground truncate">{session.quiz.title}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={restart} size="lg" style={{ background: "var(--gradient-hero)" }} className="text-primary-foreground">
                <Home className="h-4 w-4" /> Nouveau quiz
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  const s = loadSession();
                  if (s) {
                    saveSessionFresh(s);
                    navigate({ to: "/quiz" });
                  }
                }}
              >
                <RotateCcw className="h-4 w-4" /> Refaire ce quiz
              </Button>
            </div>
          </Card>

          {wrong.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold mb-1">Révisions</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {wrong.length} question{wrong.length > 1 ? "s" : ""} à revoir.
              </p>
              <div className="grid gap-4">
                {wrong.map((a) => {
                  const q = session.quiz.questions[a.questionIndex];
                  return (
                    <Card key={a.questionIndex} className="p-5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Question {a.questionIndex + 1}
                      </p>
                      <h3 className="mt-1 font-semibold">{q.question}</h3>
                      <div className="mt-3 grid gap-2 text-sm">
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div>
                            <span className="text-xs uppercase tracking-wide text-destructive">Votre réponse</span>
                            <p>{q.options[a.selectedIndex]}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 rounded-lg bg-success/10 p-3">
                          <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                          <div>
                            <span className="text-xs uppercase tracking-wide text-success">Bonne réponse</span>
                            <p>{q.options[q.correctIndex]}</p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Explication. </span>
                        {q.explanation}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <StudyPlan />
        </div>
      </main>
    </div>
  );
}

function saveSessionFresh(s: QuizSession) {
  // Reset answers to retake the same quiz
  const fresh: QuizSession = { quiz: s.quiz, answers: [] };
  sessionStorage.setItem("appquiz-current-session", JSON.stringify(fresh));
}