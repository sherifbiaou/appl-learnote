import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Send, X, Loader2 } from "lucide-react";
import { loadSession } from "@/lib/quiz-store";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const TUTOR_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutor-ai`;

export function TutorChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const session = loadSession();
      const quiz = session ? {
        title: session.quiz.title,
        questions: session.quiz.questions,
        answers: session.answers,
      } : undefined;

      const resp = await fetch(TUTOR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode: "chat", messages: newMsgs, quiz }),
      });

      if (resp.status === 429) { toast.error("Trop de requêtes, réessayez dans un instant."); setLoading(false); return; }
      if (resp.status === 402) { toast.error("Crédits IA épuisés."); setLoading(false); return; }
      if (!resp.ok || !resp.body) { toast.error("Erreur du tuteur IA"); setLoading(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let done = false;

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistant } : m));
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)] transition-transform hover:scale-105"
        style={{ background: "var(--gradient-hero)" }}
        aria-label="Ouvrir le tuteur IA"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 flex h-[min(600px,80vh)] w-[min(420px,calc(100vw-3rem))] flex-col overflow-hidden shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ background: "var(--gradient-hero)" }}>
        <div className="flex items-center gap-2 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold text-sm">Tuteur IA</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-primary-foreground/80 hover:text-primary-foreground" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>👋 Salut ! Je suis ton tuteur IA. Je connais ton quiz et tes réponses.</p>
            <p>Demande-moi par exemple :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>« Explique-moi la question 3 »</li>
              <li>« Approfondis ce sujet avec un exemple »</li>
              <li>« Pourquoi ma réponse était fausse ? »</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded-xl p-3 text-sm ${m.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-secondary/60"}`}>
            {m.role === "assistant" ? (
              <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1">
                <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="mr-8 rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Réflexion…
          </div>
        )}
      </div>

      <div className="border-t p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Pose ta question…"
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={loading}
        />
        <Button size="sm" onClick={send} disabled={loading || !input.trim()} style={{ background: "var(--gradient-hero)" }} className="text-primary-foreground">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}