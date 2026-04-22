import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { saveSession } from "@/lib/quiz-store";
import type { QuizSource, Quiz } from "@/lib/quiz-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/Brand";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  FileText, Link2, Image as ImageIcon, Video, Upload, X, Wand2, Loader2, Brain,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "appQuiz — Flash quiz interactif depuis vos ressources" },
      {
        name: "description",
        content:
          "Créez des quiz personnalisés à partir de vos documents, images, vidéos et liens. Inspiré de Question pour un champion.",
      },
      { property: "og:title", content: "appQuiz — Flash quiz interactif" },
      {
        property: "og:description",
        content: "Transformez n'importe quelle ressource en quiz éducatif.",
      },
    ],
  }),
  component: Index,
});

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

async function fileToText(file: File): Promise<string> {
  if (file.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(file.name)) {
    return await file.text();
  }
  // For PDFs/Docx we just send the filename + best-effort text fallback
  try {
    return await file.text();
  } catch {
    return `Fichier joint: ${file.name}`;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Index() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState("");
  const [count, setCount] = useState(10);
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const addText = () => {
    if (!text.trim()) return;
    setSources((s) => [
      ...s,
      { id: uid(), kind: "text", label: "Texte collé", content: text.trim() },
    ]);
    setText("");
  };
  const addUrl = () => {
    if (!url.trim()) return;
    setSources((s) => [
      ...s,
      { id: uid(), kind: "url", label: url.trim(), content: url.trim() },
    ]);
    setUrl("");
  };
  const addVideo = () => {
    if (!video.trim()) return;
    setSources((s) => [
      ...s,
      { id: uid(), kind: "video", label: video.trim(), content: video.trim() },
    ]);
    setVideo("");
  };
  const addFiles = async (files: FileList | null, kind: "document" | "image") => {
    if (!files) return;
    const newOnes: QuizSource[] = [];
    for (const f of Array.from(files)) {
      if (kind === "image") {
        const dataUrl = await fileToDataUrl(f);
        newOnes.push({ id: uid(), kind: "image", label: f.name, dataUrl });
      } else {
        const content = await fileToText(f);
        newOnes.push({ id: uid(), kind: "document", label: f.name, content });
      }
    }
    setSources((s) => [...s, ...newOnes]);
  };
  const remove = (id: string) =>
    setSources((s) => s.filter((x) => x.id !== id));

  const callFn = async (mode: "suggest" | "generate") => {
    const payloadSources = sources.map((s) => ({
      kind: s.kind,
      label: s.label,
      content: s.content,
      dataUrl: s.dataUrl,
    }));
    const { data, error } = await supabase.functions.invoke("generate-quiz", {
      body: { sources: payloadSources, mode, requestedCount: count },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const onSuggest = async () => {
    if (sources.length === 0) {
      toast.error("Ajoutez au moins une source.");
      return;
    }
    setSuggesting(true);
    try {
      const data = await callFn("suggest");
      setCount(Math.max(3, Math.min(30, Math.round(data.suggested))));
      setTopic(data.topic);
      toast.success(`Suggestion : ${data.suggested} questions`, {
        description: data.reasoning,
      });
    } catch (e: any) {
      toast.error(e.message || "Échec de la suggestion");
    } finally {
      setSuggesting(false);
    }
  };

  const onGenerate = async () => {
    // Auto-add pending text/url/video so users don't have to press "Ajouter" first
    let effective = sources;
    const pending: QuizSource[] = [];
    if (text.trim()) pending.push({ id: uid(), kind: "text", label: "Texte collé", content: text.trim() });
    if (url.trim()) pending.push({ id: uid(), kind: "url", label: url.trim(), content: url.trim() });
    if (video.trim()) pending.push({ id: uid(), kind: "video", label: video.trim(), content: video.trim() });
    if (pending.length) {
      effective = [...sources, ...pending];
      setSources(effective);
      setText(""); setUrl(""); setVideo("");
    }
    if (effective.length === 0) {
      toast.error("Ajoutez au moins une source (texte, lien, document, image ou vidéo).");
      return;
    }
    setGenerating(true);
    try {
      const payloadSources = effective.map((s) => ({
        kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl,
      }));
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { sources: payloadSources, mode: "generate", requestedCount: count },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const quiz = data as Quiz;
      if (!quiz?.questions?.length) throw new Error("Aucune question générée");
      saveSession({ quiz, answers: [] });
      navigate({ to: "/quiz" });
    } catch (e: any) {
      toast.error(e.message || "Échec de la génération");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <Toaster richColors position="top-center" />
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <span className="text-sm text-muted-foreground hidden sm:inline">
          Flash quiz à partir de vos ressources
        </span>
      </header>

      <main className="container mx-auto px-6 pb-20">
        <section className="mx-auto max-w-3xl text-center pt-8 pb-12">
          <Badge variant="secondary" className="mb-4 gap-1">
            <Brain className="h-3 w-3" /> Inspiré de Question pour un champion
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
            Apprenez plus vite,
            <span className="block bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
              une question à la fois.
            </span>
          </h1>
          <p className="mt-4 text-muted-foreground text-lg">
            Importez documents, images, vidéos ou liens. L'IA crée un quiz sur mesure.
          </p>
        </section>

        <div className="mx-auto max-w-3xl grid gap-6">
          <Card className="p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-semibold mb-4">1. Vos ressources</h2>

            <div className="grid gap-5">
              <div>
                <Label className="mb-2 flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" /> Texte ou notes
                </Label>
                <div className="flex gap-2">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Collez ici un cours, un résumé, des notes…"
                    className="min-h-[80px]"
                  />
                  <Button onClick={addText} variant="secondary" className="self-end">
                    Ajouter
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4 text-primary" /> Lien web
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://…"
                    />
                    <Button onClick={addUrl} variant="secondary">+</Button>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <Video className="h-4 w-4 text-primary" /> Vidéo (URL)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={video}
                      onChange={(e) => setVideo(e.target.value)}
                      placeholder="YouTube, Vimeo…"
                    />
                    <Button onClick={addVideo} variant="secondary">+</Button>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <Upload className="h-4 w-4 text-primary" /> Documents
                  </Label>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files, "document")}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choisir des fichiers
                  </Button>
                </div>
                <div>
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <ImageIcon className="h-4 w-4 text-primary" /> Images
                  </Label>
                  <input
                    ref={imgRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files, "image")}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => imgRef.current?.click()}
                  >
                    Choisir des images
                  </Button>
                </div>
              </div>
            </div>

            {sources.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  {sources.length} source{sources.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs"
                    >
                      <SourceIcon kind={s.kind} />
                      <span className="max-w-[180px] truncate">{s.label}</span>
                      <button
                        onClick={() => remove(s.id)}
                        className="ml-1 rounded-full p-0.5 hover:bg-background"
                        aria-label="Retirer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-semibold mb-4">2. Nombre de questions</h2>
            <div className="flex flex-wrap items-center gap-4">
              <Input
                type="number"
                min={3}
                max={30}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 10)}
                className="w-28 text-lg"
              />
              <Button
                variant="outline"
                onClick={onSuggest}
                disabled={suggesting || sources.length === 0}
              >
                {suggesting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Analyse…</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Me suggérer un nombre</>
                )}
              </Button>
              {topic && (
                <span className="text-sm text-muted-foreground">
                  Sujet détecté : <span className="text-foreground font-medium">{topic}</span>
                </span>
              )}
            </div>
          </Card>

          <Button
            size="lg"
            className="h-14 text-base font-semibold shadow-[var(--shadow-soft)]"
            style={{ background: "var(--gradient-hero)" }}
            onClick={onGenerate}
            disabled={generating || (sources.length === 0 && !text.trim() && !url.trim() && !video.trim())}
          >
            {generating ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Génération du quiz…</>
            ) : (
              <>Lancer le quiz →</>
            )}
          </Button>
          {sources.length === 0 && !text.trim() && !url.trim() && !video.trim() && (
            <p className="text-center text-sm text-muted-foreground -mt-2">
              Ajoutez d'abord une source (texte, lien, document, image ou vidéo) ci-dessus.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function SourceIcon({ kind }: { kind: QuizSource["kind"] }) {
  const cls = "h-3 w-3 text-primary";
  if (kind === "url") return <Link2 className={cls} />;
  if (kind === "video") return <Video className={cls} />;
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "document") return <Upload className={cls} />;
  return <FileText className={cls} />;
}
