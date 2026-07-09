import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadSources } from "@/lib/quiz-store";
import type { QuizSource } from "@/lib/quiz-types";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Timer, BookOpen, Sigma, Trophy, AlertTriangle, Play, Check, X as XIcon, Save, Trash2, RotateCcw, Library } from "lucide-react";
import { loadExamBank, addExam, removeExam, updateExam, type SavedExam } from "@/lib/exam-bank";

export const Route = createFileRoute("/exam")({
  head: () => ({
    meta: [
      { title: "Examen adaptatif chronométré — learnote" },
      { name: "description", content: "Passez un examen chronométré où l'IA ajuste la difficulté des questions selon vos réponses pour tester réellement vos connaissances." },
      { property: "og:title", content: "Examen adaptatif chronométré — learnote" },
      { property: "og:description", content: "Passez un examen chronométré où l'IA ajuste la difficulté des questions selon vos réponses pour tester réellement vos connaissances." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://appl-learnote.lovable.app/exam" },
    ],
    links: [{ rel: "canonical", href: "https://appl-learnote.lovable.app/exam" }],
  }),
  component: ExamPage,
});

interface AdaptiveQ {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  topic: string;
}
interface AnswerRec extends AdaptiveQ { selected: number; correct: boolean }

function ExamPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [totalQ, setTotalQ] = useState(10);
  const [totalMin, setTotalMin] = useState(15);
  const [current, setCurrent] = useState<AdaptiveQ | null>(null);
  const [answers, setAnswers] = useState<AnswerRec[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [targetDiff, setTargetDiff] = useState(3);
  const [startDiff, setStartDiff] = useState(3);
  const [examName, setExamName] = useState("");
  const [bank, setBank] = useState<SavedExam[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => { setSources(loadSources()); setBank(loadExamBank()); }, []);

  // Timer
  useEffect(() => {
    if (phase !== "running") return;
    if (secondsLeft <= 0) { finish(); return; }
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  const fetchNext = async (currentAnswers: AnswerRec[], diff: number) => {
    setLoadingNext(true);
    try {
      const payload = sources.map((s) => ({ kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType }));
      const previous = currentAnswers.map((a) => ({ question: a.question, difficulty: a.difficulty, correct: a.correct }));
      const { data: res, error } = await supabase.functions.invoke("adaptive-exam", {
        body: {
          sources: payload,
          previous,
          targetDifficulty: diff,
          questionIndex: currentAnswers.length,
          totalQuestions: totalQ,
        },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setCurrent(res as AdaptiveQ);
      setSelected(null);
      setRevealed(false);
    } catch (e: any) {
      toast.error(e.message || "Erreur génération question");
    } finally { setLoadingNext(false); }
  };

  const start = async () => {
    if (sources.length === 0) { toast.error("Aucune source — retourne à l'accueil pour en ajouter."); return; }
    finishedRef.current = false;
    setAnswers([]);
    setTargetDiff(startDiff);
    setSecondsLeft(totalMin * 60);
    setPhase("running");
    await fetchNext([], startDiff);
  };

  const submit = () => {
    if (selected === null || !current) return;
    setRevealed(true);
  };

  const next = async () => {
    if (selected === null || !current) return;
    const correct = selected === current.correctIndex;
    const rec: AnswerRec = { ...current, selected, correct };
    const newAnswers = [...answers, rec];
    setAnswers(newAnswers);
    // Adaptive: +1 if correct, -1 if wrong, clamp 1-5
    const newDiff = Math.max(1, Math.min(5, targetDiff + (correct ? 1 : -1)));
    setTargetDiff(newDiff);
    if (newAnswers.length >= totalQ) { finish(newAnswers); return; }
    await fetchNext(newAnswers, newDiff);
  };

  const finish = (final?: AnswerRec[]) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const finalAnswers = final ?? answers;
    if (final) setAnswers(final);
    setPhase("done");
    if (activeExamId) {
      const score = finalAnswers.filter((a) => a.correct).length;
      updateExam(activeExamId, { lastScore: { score, total: finalAnswers.length, finalDiff: targetDiff, at: Date.now() } });
      setBank(loadExamBank());
    }
  };

  const saveCurrentConfig = () => {
    if (sources.length === 0) { toast.error("Ajoute des sources d'abord."); return; }
    const name = examName.trim() || `Examen ${new Date().toLocaleDateString("fr-FR")} — ${totalQ}Q/${totalMin}min`;
    const exam: SavedExam = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      totalQ,
      totalMin,
      startDifficulty: startDiff,
      sources,
      createdAt: Date.now(),
    };
    addExam(exam);
    setBank(loadExamBank());
    setExamName("");
    toast.success("Examen enregistré dans la banque");
  };

  const replayExam = async (e: SavedExam) => {
    setSources(e.sources);
    setTotalQ(e.totalQ);
    setTotalMin(e.totalMin);
    setStartDiff(e.startDifficulty);
    setActiveExamId(e.id);
    finishedRef.current = false;
    setAnswers([]);
    setTargetDiff(e.startDifficulty);
    setSecondsLeft(e.totalMin * 60);
    setPhase("running");
    await fetchNext([], e.startDifficulty);
  };

  const deleteSaved = (id: string) => {
    removeExam(id);
    setBank(loadExamBank());
    toast.message("Examen supprimé");
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(Math.max(0, s) / 60);
    const ss = Math.max(0, s) % 60;
    return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
  };

  const score = answers.filter((a) => a.correct).length;
  const lowTime = secondsLeft <= 60 && phase === "running";

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link to="/" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary">Accueil</Link>
          <Link to="/summary" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> Résumé</Link>
          <Link to="/formulas" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Sigma className="h-4 w-4" /> Formules</Link>
        </nav>
      </header>

      <main className="container mx-auto max-w-3xl px-6 pb-20">
        {phase === "setup" && (
          <>
            <div className="mb-8">
              <Badge variant="secondary" className="mb-3 gap-1"><Timer className="h-3 w-3" /> Mode examen adaptatif</Badge>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Examen chronométré</h1>
              <p className="mt-2 text-muted-foreground">Format vrai examen : chronomètre, soumission automatique. L'IA ajuste la difficulté selon tes réponses.</p>
            </div>

            <Card className="p-6 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "var(--pattern-zigzag)" }} />
              <div className="relative space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Nombre de questions</Label>
                    <Input type="number" min={3} max={40} value={totalQ} onChange={(e) => setTotalQ(Math.max(3, Math.min(40, Number(e.target.value) || 10)))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm">Durée totale (minutes)</Label>
                    <Input type="number" min={3} max={180} value={totalMin} onChange={(e) => setTotalMin(Math.max(3, Math.min(180, Number(e.target.value) || 15)))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm">Difficulté de départ (1-5)</Label>
                    <Input type="number" min={1} max={5} value={startDiff} onChange={(e) => setStartDiff(Math.max(1, Math.min(5, Number(e.target.value) || 3)))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm">Nom (pour la banque)</Label>
                    <Input value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="ex. Révision chap. 3" className="mt-1" />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>📚 {sources.length} source{sources.length > 1 ? "s" : ""} chargée{sources.length > 1 ? "s" : ""}.</p>
                  {sources.length === 0 && (
                    <p className="text-destructive mt-1">Aucune source. <Link to="/" className="underline">Va sur l'accueil pour en ajouter.</Link></p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={start} disabled={sources.length === 0} size="lg" className="flex-1 text-[oklch(0.2_0.02_80)] font-semibold" style={{ background: "var(--gradient-gold)" }}>
                    <Play className="h-4 w-4" /> Démarrer
                  </Button>
                  <Button onClick={saveCurrentConfig} disabled={sources.length === 0} size="lg" variant="outline" className="flex-1">
                    <Save className="h-4 w-4" /> Enregistrer dans la banque
                  </Button>
                </div>
              </div>
            </Card>

            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <Library className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Banque d'examens</h2>
                <Badge variant="secondary">{bank.length}</Badge>
              </div>
              {bank.length === 0 ? (
                <Card className="p-5 text-sm text-muted-foreground">
                  Aucun examen enregistré. Configure un examen ci-dessus puis clique sur « Enregistrer dans la banque » pour le retrouver et le refaire plus tard.
                </Card>
              ) : (
                <div className="grid gap-3">
                  {bank.map((e) => (
                    <Card key={e.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{e.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.totalQ} questions • {e.totalMin} min • difficulté départ {e.startDifficulty}/5 • {e.sources.length} source{e.sources.length > 1 ? "s" : ""}
                        </p>
                        {e.lastScore && (
                          <p className="text-xs text-primary mt-1">
                            Dernier score : {e.lastScore.score}/{e.lastScore.total} ({Math.round((e.lastScore.score / Math.max(1, e.lastScore.total)) * 100)}%) — diff finale {e.lastScore.finalDiff}/5
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" onClick={() => replayExam(e)} className="text-[oklch(0.2_0.02_80)] font-semibold" style={{ background: "var(--gradient-gold)" }}>
                          <RotateCcw className="h-4 w-4" /> Refaire
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSaved(e.id)} aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {phase === "running" && (
          <>
            <Card className={`mb-6 p-4 flex items-center justify-between ${lowTime ? "border-destructive" : "border-primary/40"}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${lowTime ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                  <Timer className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{fmtTime(secondsLeft)}</p>
                  <p className="text-xs text-muted-foreground">Question {answers.length + 1}/{totalQ} • Difficulté visée {targetDiff}/5</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => finish()}>Terminer maintenant</Button>
            </Card>

            {lowTime && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" /> Moins d'une minute restante !
              </div>
            )}

            <Card className="p-6">
              {loadingNext || !current ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Génération de la question…
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-3 text-xs text-muted-foreground">
                    <Badge variant="outline">{current.topic}</Badge>
                    <span>Difficulté {current.difficulty}/5</span>
                  </div>
                  <h2 className="text-lg font-semibold mb-5">{current.question}</h2>
                  <div className="space-y-2">
                    {current.options.map((opt, i) => {
                      const isSel = selected === i;
                      const isCorrect = i === current.correctIndex;
                      const showState = revealed;
                      return (
                        <button
                          key={i}
                          onClick={() => !revealed && setSelected(i)}
                          disabled={revealed}
                          className={`w-full text-left rounded-lg border p-3 text-sm transition-all ${
                            showState && isCorrect ? "border-success bg-success/10" :
                            showState && isSel && !isCorrect ? "border-destructive bg-destructive/10" :
                            isSel ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{String.fromCharCode(65 + i)}</span>
                            <span className="flex-1">{opt}</span>
                            {showState && isCorrect && <Check className="h-4 w-4 text-success" />}
                            {showState && isSel && !isCorrect && <XIcon className="h-4 w-4 text-destructive" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {revealed && (
                    <div className="mt-4 rounded-lg bg-secondary/50 p-3 text-sm">
                      <p className="font-semibold mb-1">Explication</p>
                      <p className="text-muted-foreground">{current.explanation}</p>
                    </div>
                  )}

                  <div className="mt-5 flex gap-2 justify-end">
                    {!revealed ? (
                      <Button onClick={submit} disabled={selected === null} style={{ background: "var(--gradient-gold)" }} className="text-[oklch(0.2_0.02_80)] font-semibold">
                        Valider
                      </Button>
                    ) : (
                      <Button onClick={next} disabled={loadingNext}>
                        {answers.length + 1 >= totalQ ? "Terminer" : "Question suivante →"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {phase === "done" && (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4" style={{ background: "var(--gradient-gold)" }}>
              <Trophy className="h-8 w-8 text-[oklch(0.2_0.02_80)]" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Examen terminé</h2>
            <p className="text-5xl font-bold text-primary my-4 tabular-nums">{score}<span className="text-2xl text-muted-foreground">/{answers.length}</span></p>
            <p className="text-muted-foreground mb-6">{Math.round((score / Math.max(1, answers.length)) * 100)}% de bonnes réponses • Difficulté finale {targetDiff}/5</p>

            <div className="text-left max-w-xl mx-auto space-y-2 mb-6">
              {answers.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm border-l-2 pl-3 py-1" style={{ borderColor: a.correct ? "var(--success)" : "var(--destructive)" }}>
                  <span className="text-muted-foreground">Q{i + 1} (diff {a.difficulty}/5)</span>
                  <span className="flex-1 truncate">{a.question}</span>
                  {a.correct ? <Check className="h-4 w-4 text-success" /> : <XIcon className="h-4 w-4 text-destructive" />}
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => { setPhase("setup"); setAnswers([]); setCurrent(null); setActiveExamId(null); }}>Retour configuration</Button>
              <Button onClick={() => navigate({ to: "/" })} style={{ background: "var(--gradient-gold)" }} className="text-[oklch(0.2_0.02_80)] font-semibold">Retour accueil</Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}