import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { saveSession, saveSources } from "@/lib/quiz-store";
import type { QuizSource, Quiz } from "@/lib/quiz-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/Brand";
import { ThemePicker } from "@/components/ThemePicker";
import { toast } from "sonner";
import {
  FileText, Link2, Image as ImageIcon, Video, Upload, X, Wand2, Loader2, Brain,
  Search, FileVideo, BookOpen, Sigma, Timer, Sparkles, AlertTriangle, RefreshCw,
} from "lucide-react";
import { shuffleQuizOptions } from "@/lib/shuffle-quiz";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "learnote — Étudier plus vite avec l'IA" },
      {
        name: "description",
        content:
          "learnote crée quiz, résumés et examens adaptatifs depuis vos documents, images, vidéos et liens.",
      },
      { property: "og:title", content: "learnote — Étudier plus vite avec l'IA" },
      {
        property: "og:description",
        content: "Transformez n'importe quelle ressource en quiz, résumé ou examen personnalisé.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://appl-learnote.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://appl-learnote.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "learnote",
          url: "https://appl-learnote.lovable.app/",
          logo: "https://appl-learnote.lovable.app/learnote-mark.png",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "learnote",
          url: "https://appl-learnote.lovable.app/",
          inLanguage: "fr",
        }),
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
  return "";
}

function isPlainTextFile(file: File): boolean {
  return (
    file.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(file.name)
  );
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
  const [webQuery, setWebQuery] = useState("");
  const [count, setCount] = useState(10);
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ message: string; retryable: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Persist sources whenever they change so Résumé / Formules / Examen / Studio
  // pages can read them without needing to generate a quiz first.
  useEffect(() => {
    saveSources(sources);
  }, [sources]);

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
  const addWebSearch = () => {
    if (!webQuery.trim()) return;
    setSources((s) => [
      ...s,
      { id: uid(), kind: "websearch", label: `🔎 ${webQuery.trim()}`, content: webQuery.trim() },
    ]);
    setWebQuery("");
  };
  const addLocalVideos = async (files: FileList | null) => {
    if (!files) return;
    const MAX_DIRECT = 20 * 1024 * 1024; // 20MB
    const newOnes: QuizSource[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_DIRECT) {
        toast.warning(`"${f.name}" dépasse 20MB — l'IA s'appuiera sur le nom du fichier (transcription complète bientôt).`);
        newOnes.push({
          id: uid(),
          kind: "video",
          label: `🎬 ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB, trop volumineux)`,
          content: `Vidéo locale "${f.name}" (${(f.size / 1024 / 1024).toFixed(1)} MB) — sujet à inférer du nom de fichier.`,
        });
      } else {
        const dataUrl = await fileToDataUrl(f);
        newOnes.push({
          id: uid(),
          kind: "video-file",
          label: `🎬 ${f.name}`,
          dataUrl,
          mimeType: f.type,
          sizeBytes: f.size,
        });
      }
    }
    setSources((s) => [...s, ...newOnes]);
  };
  const addFiles = async (files: FileList | null, kind: "document" | "image") => {
    if (!files) return;
    const newOnes: QuizSource[] = [];
    for (const f of Array.from(files)) {
      if (kind === "image") {
        const dataUrl = await fileToDataUrl(f);
        newOnes.push({ id: uid(), kind: "image", label: f.name, dataUrl });
      } else {
        if (isPlainTextFile(f)) {
          const content = await fileToText(f);
          newOnes.push({ id: uid(), kind: "document", label: f.name, content });
        } else {
          // PDFs / docx: send as base64 data URL so the model can read them.
          const dataUrl = await fileToDataUrl(f);
          newOnes.push({
            id: uid(),
            kind: "document",
            label: f.name,
            dataUrl,
            mimeType: f.type || "application/pdf",
            sizeBytes: f.size,
          });
        }
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
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
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
    setErrorState(null);
    // Auto-add pending text/url/video so users don't have to press "Ajouter" first
    let effective = sources;
    const pending: QuizSource[] = [];
    if (text.trim()) pending.push({ id: uid(), kind: "text", label: "Texte collé", content: text.trim() });
    if (url.trim()) pending.push({ id: uid(), kind: "url", label: url.trim(), content: url.trim() });
    if (video.trim()) pending.push({ id: uid(), kind: "video", label: video.trim(), content: video.trim() });
    if (webQuery.trim()) pending.push({ id: uid(), kind: "websearch", label: `🔎 ${webQuery.trim()}`, content: webQuery.trim() });
    if (pending.length) {
      effective = [...sources, ...pending];
      setSources(effective);
      setText(""); setUrl(""); setVideo(""); setWebQuery("");
    }
    if (effective.length === 0) {
      toast.error("Ajoutez au moins une source (texte, lien, document, image ou vidéo).");
      return;
    }
    setGenerating(true);
    try {
      const payloadSources = effective.map((s) => ({
        kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType,
      }));
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { sources: payloadSources, mode: "generate", requestedCount: count },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const quiz = shuffleQuizOptions(data as Quiz);
      if (!quiz?.questions?.length) throw new Error("Aucune question générée");
      saveSources(effective);
      saveSession({ quiz, answers: [] });
      navigate({ to: "/quiz" });
    } catch (e: any) {
      const msg = e?.message || "Échec de la génération";
      setErrorState({ message: msg, retryable: true });
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const resetSources = () => {
    setSources([]);
    setText(""); setUrl(""); setVideo(""); setWebQuery("");
    setErrorState(null);
    if (fileRef.current) fileRef.current.value = "";
    if (imgRef.current) imgRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
    toast.info("Sources réinitialisées — ajoutez d'autres fichiers.");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <nav className="flex items-center gap-1 text-sm">
          <div className="hidden sm:flex items-center gap-1">
          <Link to="/summary" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> Résumé
          </Link>
          <Link to="/formulas" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors flex items-center gap-1.5">
            <Sigma className="h-4 w-4" /> Formules
          </Link>
          <Link to="/exam" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors flex items-center gap-1.5">
            <Timer className="h-4 w-4" /> Examen
          </Link>
          <Link to="/studio" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Studio
          </Link>
          </div>
          <div className="ml-2 pl-2 sm:border-l border-border">
            <ThemePicker />
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-6 pb-20">
        <section className="mx-auto max-w-3xl text-center pt-8 pb-12">
          <Badge variant="secondary" className="mb-4 gap-1">
            <Brain className="h-3 w-3" /> learnote — étudier avec l'IA
          </Badge>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tight text-foreground">
            Apprenez plus vite,
            <span className="block italic bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
              une note à la fois.
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

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <Search className="h-4 w-4 text-primary" /> Recherche web Google
                  </Label>
                  <p className="text-[11px] text-muted-foreground mb-2">L'IA va explorer le web pour ce sujet.</p>
                  <div className="flex gap-2">
                    <Input
                      value={webQuery}
                      onChange={(e) => setWebQuery(e.target.value)}
                      placeholder="ex: photosynthèse niveau lycée"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWebSearch(); } }}
                    />
                    <Button onClick={addWebSearch} variant="secondary">+</Button>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <Label className="mb-2 flex items-center gap-2 text-sm">
                    <FileVideo className="h-4 w-4 text-primary" /> Vidéo locale
                  </Label>
                  <p className="text-[11px] text-muted-foreground mb-2">≤20MB analysé directement, sinon nom utilisé.</p>
                  <input
                    ref={videoFileRef}
                    type="file"
                    multiple
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => addLocalVideos(e.target.files)}
                  />
                  <Button variant="outline" className="w-full" onClick={() => videoFileRef.current?.click()}>
                    Importer une vidéo
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
          {errorState && (
            <Card className="p-5 border-2 border-destructive/40 bg-destructive/5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-destructive/15 p-2 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">Impossible de générer le quiz</p>
                  <p className="mt-1 text-sm text-muted-foreground break-words">{errorState.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cela peut venir d'un fichier trop lourd, d'un format non lu, ou d'une saturation temporaire de l'IA.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={onGenerate} disabled={generating}>
                      <RefreshCw className="h-4 w-4" /> Réessayer
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetSources}>
                      <X className="h-4 w-4" /> Changer de sources
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setErrorState(null)}>
                      Fermer
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
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
