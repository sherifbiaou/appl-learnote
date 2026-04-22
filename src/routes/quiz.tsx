import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Brand } from "@/components/Brand";
import { loadSession, saveSession } from "@/lib/quiz-store";
import type { QuizSession } from "@/lib/quiz-types";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz en cours — appQuiz" },
      { name: "description", content: "Répondez aux questions générées par l'IA." },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSession(s);
  }, [navigate]);

  if (!session) return null;
  const q = session.quiz.questions[idx];
  const total = session.quiz.questions.length;
  const score = session.answers.filter((a) => a.correct).length;

  const choose = (i: number) => {
    if (revealed) return;
    setPicked(i);
    setRevealed(true);
    const correct = i === q.correctIndex;
    const updated: QuizSession = {
      ...session,
      answers: [...session.answers, { questionIndex: idx, selectedIndex: i, correct }],
    };
    setSession(updated);
    saveSession(updated);
  };

  const next = () => {
    if (idx + 1 >= total) {
      navigate({ to: "/results" });
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
    setRevealed(false);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <div className="text-sm text-muted-foreground">
          Score : <span className="font-semibold text-foreground">{score}</span> / {total}
        </div>
      </header>

      <main className="container mx-auto px-6 pb-20">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <div className="flex justify-between text-xs uppercase tracking-wide text-muted-foreground mb-2">
              <span>Question {idx + 1} / {total}</span>
              <span className="truncate max-w-[60%] text-right">{session.quiz.title}</span>
            </div>
            <Progress value={((idx + (revealed ? 1 : 0)) / total) * 100} className="h-2" />
          </div>

          <Card className="p-8 shadow-[var(--shadow-soft)]">
            <h2 className="text-2xl font-semibold leading-snug mb-6">{q.question}</h2>
            <div className="grid gap-3">
              {q.options.map((opt, i) => {
                const isCorrect = i === q.correctIndex;
                const isPicked = picked === i;
                let cls =
                  "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-[var(--transition-smooth)] hover:border-primary/40 hover:bg-primary/5";
                if (revealed) {
                  if (isCorrect) cls += " border-success bg-success/10";
                  else if (isPicked) cls += " border-destructive bg-destructive/10";
                  else cls += " border-border opacity-60";
                } else {
                  cls += " border-border bg-card";
                }
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    disabled={revealed}
                    className={cls}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {revealed && isCorrect && <Check className="h-5 w-5 text-success" />}
                    {revealed && isPicked && !isCorrect && (
                      <X className="h-5 w-5 text-destructive" />
                    )}
                  </button>
                );
              })}
            </div>

            {revealed && (
              <div className="mt-6 rounded-xl bg-secondary/60 p-4">
                <p className="text-sm">
                  <span className="font-semibold">Explication. </span>
                  {q.explanation}
                </p>
              </div>
            )}
          </Card>

          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              onClick={next}
              disabled={!revealed}
              style={{ background: "var(--gradient-hero)" }}
              className="text-primary-foreground"
            >
              {idx + 1 >= total ? "Voir mes résultats →" : "Question suivante →"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}