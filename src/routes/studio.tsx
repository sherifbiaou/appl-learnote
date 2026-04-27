import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ImageIcon, BookOpenCheck, BarChart3, Table as TableIcon, Sparkles, Download, BookOpen, Sigma, Timer, Palette, FileDown, RefreshCw, Check, X, Trash2, Save, FolderOpen, History, GitCompare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import jsPDF from "jspdf";
import { listStudioSessions, saveStudioSession, deleteStudioSession, type SavedStudioSession } from "@/lib/studio-history";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio visuel — SmartQuiz" },
      { name: "description", content: "Génère images, BD, graphiques et tableaux pour mieux comprendre tes notions." },
    ],
  }),
  component: StudioPage,
});

type Mode = "image" | "comic" | "chart" | "table";

interface ChartData {
  title: string;
  description?: string;
  chartType: "bar" | "line" | "pie" | "area";
  xKey: string;
  series: { name: string; dataKey: string }[];
  data: Record<string, string | number>[];
  insight: string;
  citations?: string[];
}
interface TableData {
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
  insight: string;
  citations?: string[];
}
interface Scenario {
  title: string;
  panels: { scene: string; bubble: string }[];
}
interface SessionItem {
  id: string;
  mode: Mode;
  prompt: string;
  imageUrl?: string;
  chart?: ChartData;
  table?: TableData;
  versions?: ItemVersion[];
  currentVersionIndex?: number;
}
interface ItemVersion {
  at: number;
  prompt: string;
  imageUrl?: string;
  chart?: ChartData;
  table?: TableData;
}

const PALETTE = ["#d4a017", "#7aa2ff", "#9b6dff", "#ff8a5b", "#3ec9a7", "#e64980"];

const THEMES = [
  { id: "default", label: "SmartQuiz (or & sobre)", palette: "or doré sur gris foncé, accents subtils", font: "sans-serif moderne", vibe: "épuré, pédagogique" },
  { id: "vibrant", label: "Vibrant scolaire", palette: "couleurs primaires vives (rouge, bleu, jaune)", font: "sans-serif arrondi", vibe: "ludique, énergique" },
  { id: "pastel", label: "Pastel doux", palette: "tons pastel (rose poudré, menthe, lavande)", font: "sans-serif léger", vibe: "doux, accueillant" },
  { id: "scientific", label: "Scientifique", palette: "bleu marine, blanc, gris, accents cyan", font: "serif technique type IBM Plex", vibe: "rigoureux, précis" },
  { id: "retro", label: "Rétro 80s", palette: "néon magenta, cyan, fond noir", font: "display géométrique", vibe: "rétrofuturiste" },
  { id: "noir", label: "Noir & blanc", palette: "noir, blanc, niveaux de gris", font: "serif classique", vibe: "minimal, éditorial" },
];

function StudioPage() {
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(false);

  // Theme panel
  const [themeId, setThemeId] = useState("default");
  const [customPalette, setCustomPalette] = useState("");
  const [customFont, setCustomFont] = useState("");
  const [customVibe, setCustomVibe] = useState("");

  // Citations toggle (chart/table)
  const [requireCitations, setRequireCitations] = useState(true);

  // Comic scenario flow
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioValidated, setScenarioValidated] = useState(false);
  const [genScenarioLoading, setGenScenarioLoading] = useState(false);

  // Current results
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [table, setTable] = useState<TableData | null>(null);

  // Session items (everything generated this session) for PDF export
  const [session, setSession] = useState<SessionItem[]>([]);
  // Active item id (the visual currently displayed) — regenerations stack onto it
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // History (saved studio sessions)
  const [history, setHistory] = useState<SavedStudioSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState<string>("");
  const [saveName, setSaveName] = useState("");

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSources(loadSources()); setHistory(listStudioSessions()); }, []);

  const reset = () => { setImageUrl(null); setChart(null); setTable(null); };

  const currentTheme = () => {
    const preset = THEMES.find((t) => t.id === themeId);
    return {
      palette: customPalette || preset?.palette,
      font: customFont || preset?.font,
      vibe: customVibe || preset?.vibe,
    };
  };

  const buildPayload = (extra: Record<string, unknown> = {}) => ({
    sources: sources.map((s) => ({ kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType })),
    prompt,
    aspect,
    style,
    theme: currentTheme(),
    ...extra,
  });

  const generateScenario = async () => {
    if (!prompt.trim()) { toast.error("Décris la notion à expliquer en BD."); return; }
    setGenScenarioLoading(true);
    setScenario(null);
    setScenarioValidated(false);
    try {
      const { data, error } = await supabase.functions.invoke("visual-studio", {
        body: { mode: "comic-scenario", ...buildPayload() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setScenario(data as Scenario);
      toast.success("Scénario prêt — relis et valide.");
    } catch (e: any) {
      toast.error(e.message || "Erreur scénario");
    } finally { setGenScenarioLoading(false); }
  };

  const updatePanel = (i: number, field: "scene" | "bubble", value: string) => {
    if (!scenario) return;
    const panels = scenario.panels.map((p, idx) => (idx === i ? { ...p, [field]: value } : p));
    setScenario({ ...scenario, panels });
  };

  const generate = async (opts: { regenerate?: boolean } = {}) => {
    if (!prompt.trim()) { toast.error("Décris ce que tu veux générer."); return; }
    if (mode === "comic" && !scenarioValidated) { toast.error("Génère et valide d'abord le scénario."); return; }
    setLoading(true);
    reset();
    try {
      const extra: Record<string, unknown> = {};
      if (mode === "comic" && scenario) {
        extra.scenario = scenario.panels.map((p, i) => `Case ${i + 1} — ${p.scene} | Bulle: "${p.bubble}"`).join("\n");
      }
      if (mode === "chart" || mode === "table") extra.requireCitations = requireCitations;

      const { data, error } = await supabase.functions.invoke("visual-studio", {
        body: { mode, ...buildPayload(extra) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const newVersion: ItemVersion = { at: Date.now(), prompt };
      if (mode === "image" || mode === "comic") {
        setImageUrl((data as any).imageUrl);
        newVersion.imageUrl = (data as any).imageUrl;
      } else if (mode === "chart") {
        setChart(data as ChartData);
        newVersion.chart = data as ChartData;
      } else if (mode === "table") {
        setTable(data as TableData);
        newVersion.table = data as TableData;
      }

      // If regenerating an existing active item of the same mode, push a new version onto it.
      const existing = activeItemId ? session.find((it) => it.id === activeItemId) : null;
      if (opts.regenerate && existing && existing.mode === mode) {
        setSession((s) => s.map((it) => {
          if (it.id !== existing.id) return it;
          const baseVersions: ItemVersion[] = it.versions && it.versions.length
            ? it.versions
            : [{ at: Date.now(), prompt: it.prompt, imageUrl: it.imageUrl, chart: it.chart, table: it.table }];
          const versions = [...baseVersions, newVersion];
          return {
            ...it,
            prompt,
            imageUrl: newVersion.imageUrl,
            chart: newVersion.chart,
            table: newVersion.table,
            versions,
            currentVersionIndex: versions.length - 1,
          };
        }));
      } else {
        const item: SessionItem = {
          id: Math.random().toString(36).slice(2),
          mode, prompt,
          imageUrl: newVersion.imageUrl,
          chart: newVersion.chart,
          table: newVersion.table,
          versions: [newVersion],
          currentVersionIndex: 0,
        };
        setSession((s) => [...s, item]);
        setActiveItemId(item.id);
      }
      toast.success("Généré !");
    } catch (e: any) {
      toast.error(e.message || "Erreur de génération");
    } finally { setLoading(false); }
  };

  const regenerate = () => generate({ regenerate: true });

  // Restore a previous version of the active item (without consuming an API call)
  const restoreVersion = (index: number) => {
    if (!activeItemId) return;
    setSession((s) => s.map((it) => {
      if (it.id !== activeItemId) return it;
      const v = it.versions?.[index];
      if (!v) return it;
      // Reflect into current display
      setImageUrl(v.imageUrl ?? null);
      setChart(v.chart ?? null);
      setTable(v.table ?? null);
      return {
        ...it,
        prompt: v.prompt,
        imageUrl: v.imageUrl,
        chart: v.chart,
        table: v.table,
        currentVersionIndex: index,
      };
    }));
    toast.success(`Version ${index + 1} restaurée`);
  };

  const activeItem = activeItemId ? session.find((it) => it.id === activeItemId) ?? null : null;
  const versionsCount = activeItem?.versions?.length ?? 0;
  const currentVersionIdx = activeItem?.currentVersionIndex ?? 0;

  // Diff comparison state
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeft, setDiffLeft] = useState<number | null>(null);
  const [diffRight, setDiffRight] = useState<number | null>(null);

  const openDiff = (a: number, b: number) => {
    setDiffLeft(a);
    setDiffRight(b);
    setDiffOpen(true);
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `smartquiz-${mode}-${Date.now()}.png`;
    a.click();
  };

  const exportTableCsv = () => {
    if (!table) return;
    const csv = [table.columns, ...table.rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${table.title.replace(/\s+/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const removeSessionItem = (id: string) => {
    setSession((s) => s.filter((i) => i.id !== id));
    if (activeItemId === id) { setActiveItemId(null); reset(); }
  };

  const selectSessionItem = (id: string) => {
    const it = session.find((s) => s.id === id);
    if (!it) return;
    setActiveItemId(id);
    setMode(it.mode);
    setPrompt(it.prompt);
    setImageUrl(it.imageUrl ?? null);
    setChart(it.chart ?? null);
    setTable(it.table ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCurrentSession = () => {
    if (!session.length) { toast.error("Génère au moins un visuel avant de sauvegarder."); return; }
    const name = (saveName || currentSessionName || prompt || "Session Studio").trim().slice(0, 80);
    const saved = saveStudioSession({
      id: currentSessionId ?? undefined,
      name,
      items: session,
      theme: { themeId, customPalette, customFont, customVibe },
      lastPrompt: prompt,
      lastMode: mode,
    });
    setCurrentSessionId(saved.id);
    setCurrentSessionName(saved.name);
    setSaveName("");
    setHistory(listStudioSessions());
    toast.success(currentSessionId ? "Session mise à jour" : "Session sauvegardée");
  };

  const openSavedSession = (s: SavedStudioSession) => {
    setSession(s.items);
    setThemeId(s.theme.themeId);
    setCustomPalette(s.theme.customPalette);
    setCustomFont(s.theme.customFont);
    setCustomVibe(s.theme.customVibe);
    if (s.lastPrompt) setPrompt(s.lastPrompt);
    if (s.lastMode) setMode(s.lastMode);
    setCurrentSessionId(s.id);
    setCurrentSessionName(s.name);
    // Restore the most recent visual as the active result so user can regenerate from it
    reset();
    const last = s.items[s.items.length - 1];
    if (last) {
      setActiveItemId(last.id);
      if (last.imageUrl) setImageUrl(last.imageUrl);
      else if (last.chart) setChart(last.chart);
      else if (last.table) setTable(last.table);
    }
    toast.success(`« ${s.name} » rouverte`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeSavedSession = (id: string) => {
    deleteStudioSession(id);
    setHistory(listStudioSessions());
    if (currentSessionId === id) { setCurrentSessionId(null); setCurrentSessionName(""); }
    toast.success("Session supprimée");
  };

  const newSession = () => {
    setSession([]); reset(); setCurrentSessionId(null); setCurrentSessionName(""); setScenario(null); setScenarioValidated(false);
    toast.success("Nouvelle session vierge");
  };

  const exportSessionPdf = async () => {
    if (!session.length) { toast.error("Rien à exporter pour l'instant."); return; }
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    // Cover
    doc.setFillColor(30, 30, 35);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setTextColor(212, 160, 23);
    doc.setFontSize(28);
    doc.text("SmartQuiz — Session Studio", margin, 120);
    doc.setTextColor(230, 230, 230);
    doc.setFontSize(12);
    doc.text(`${session.length} élément${session.length > 1 ? "s" : ""} • ${new Date().toLocaleString("fr-FR")}`, margin, 150);

    for (const item of session) {
      doc.addPage();
      doc.setTextColor(30, 30, 35);
      doc.setFontSize(16);
      const title = `${item.mode.toUpperCase()} — ${item.prompt}`;
      doc.text(doc.splitTextToSize(title, pageW - margin * 2), margin, margin + 10);

      let y = margin + 50;

      if (item.imageUrl) {
        try {
          const dataUrl = await urlToDataUrl(item.imageUrl);
          const img = await loadImg(dataUrl);
          const maxW = pageW - margin * 2;
          const ratio = img.width / img.height;
          let w = maxW;
          let h = w / ratio;
          if (h > pageH - y - margin) { h = pageH - y - margin; w = h * ratio; }
          doc.addImage(dataUrl, "PNG", margin, y, w, h);
        } catch {
          doc.text("(image non incluse)", margin, y);
        }
      } else if (item.chart) {
        doc.setFontSize(11);
        doc.text(item.chart.title, margin, y); y += 18;
        doc.setFontSize(9);
        const insight = doc.splitTextToSize(`💡 ${item.chart.insight}`, pageW - margin * 2);
        doc.text(insight, margin, y); y += insight.length * 12 + 10;
        // Table form of chart data
        doc.text(`Type: ${item.chart.chartType} • Axe X: ${item.chart.xKey}`, margin, y); y += 14;
        for (const row of item.chart.data.slice(0, 25)) {
          const line = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(" | ");
          const lines = doc.splitTextToSize(line, pageW - margin * 2);
          doc.text(lines, margin, y); y += lines.length * 11;
          if (y > pageH - margin) break;
        }
        if (item.chart.citations?.length) {
          y += 10;
          doc.setFontSize(9);
          doc.text("Sources :", margin, y); y += 12;
          for (const c of item.chart.citations) {
            const lines = doc.splitTextToSize(`• ${c}`, pageW - margin * 2);
            doc.text(lines, margin, y); y += lines.length * 11;
            if (y > pageH - margin) break;
          }
        }
      } else if (item.table) {
        doc.setFontSize(11);
        doc.text(item.table.title, margin, y); y += 18;
        const cols = item.table.columns;
        const colW = (pageW - margin * 2) / cols.length;
        doc.setFontSize(9);
        cols.forEach((c, i) => doc.text(String(c), margin + i * colW, y));
        y += 14;
        for (const row of item.table.rows) {
          const heights = row.map((cell) => doc.splitTextToSize(String(cell), colW - 4).length);
          const rowH = Math.max(...heights) * 11;
          if (y + rowH > pageH - margin) { doc.addPage(); y = margin; }
          row.forEach((cell, i) => {
            const lines = doc.splitTextToSize(String(cell), colW - 4);
            doc.text(lines, margin + i * colW, y);
          });
          y += rowH + 4;
        }
        if (item.table.citations?.length) {
          y += 10;
          doc.text("Sources :", margin, y); y += 12;
          for (const c of item.table.citations) {
            const lines = doc.splitTextToSize(`• ${c}`, pageW - margin * 2);
            if (y + lines.length * 11 > pageH - margin) { doc.addPage(); y = margin; }
            doc.text(lines, margin, y); y += lines.length * 11;
          }
        }
      }
    }

    doc.save(`smartquiz-studio-${Date.now()}.pdf`);
    toast.success("PDF exporté !");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link to="/" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary">Accueil</Link>
          <Link to="/summary" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> Résumé</Link>
          <Link to="/formulas" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Sigma className="h-4 w-4" /> Formules</Link>
          <Link to="/exam" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary flex items-center gap-1.5"><Timer className="h-4 w-4" /> Examen</Link>
        </nav>
      </header>

      <main className="container mx-auto max-w-5xl px-6 pb-20">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Badge variant="secondary" className="mb-3 gap-1"><Sparkles className="h-3 w-3" /> Studio visuel SmartQuiz</Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Visualise pour mieux comprendre</h1>
            <p className="mt-2 text-muted-foreground">Image, BD pédagogique, graphique ou tableau — basés sur tes sources et ta demande.</p>
            <p className="mt-1 text-xs text-muted-foreground">📚 {sources.length} source{sources.length > 1 ? "s" : ""} chargée{sources.length > 1 ? "s" : ""} • 🗂️ {session.length} élément{session.length > 1 ? "s" : ""} en session.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={newSession} variant="ghost" className="gap-2" disabled={!session.length && !currentSessionId}>
              <Sparkles className="h-4 w-4" /> Nouvelle
            </Button>
            <Button onClick={exportSessionPdf} variant="outline" className="gap-2" disabled={!session.length}>
              <FileDown className="h-4 w-4" /> Exporter PDF ({session.length})
            </Button>
          </div>
        </div>

        {currentSessionId && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span>Session active : <strong>{currentSessionName}</strong></span>
            <Badge variant="outline" className="ml-auto text-[10px]">Les sauvegardes mettront à jour cette session</Badge>
          </div>
        )}

        {/* Theme panel */}
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Thème visuel</h2>
            <Badge variant="outline" className="ml-auto text-xs">Appliqué à toutes les générations</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Préréglage</Label>
              <Select value={themeId} onValueChange={setThemeId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Couleurs (libre)</Label>
              <Input value={customPalette} onChange={(e) => setCustomPalette(e.target.value)} placeholder="ex. terracotta, ocre, crème" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Police / typographie</Label>
              <Input value={customFont} onChange={(e) => setCustomFont(e.target.value)} placeholder="ex. serif éditorial, manuscrite…" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Ambiance / style</Label>
              <Input value={customVibe} onChange={(e) => setCustomVibe(e.target.value)} placeholder="ex. minimal, japonisant, scolaire…" className="mt-1" />
            </div>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden mb-6">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "var(--pattern-zigzag)" }} />
          <div className="relative space-y-5">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset(); setScenario(null); setScenarioValidated(false); }}>
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
                <TabsTrigger value="image" className="gap-1.5"><ImageIcon className="h-4 w-4" /> Image</TabsTrigger>
                <TabsTrigger value="comic" className="gap-1.5"><BookOpenCheck className="h-4 w-4" /> BD</TabsTrigger>
                <TabsTrigger value="chart" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Graphique</TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5"><TableIcon className="h-4 w-4" /> Tableau</TabsTrigger>
              </TabsList>

              <TabsContent value="image" className="mt-4 grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Format</Label>
                  <Select value={aspect} onValueChange={setAspect}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">Carré (1:1)</SelectItem>
                      <SelectItem value="16:9">Paysage (16:9)</SelectItem>
                      <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                      <SelectItem value="4:3">Standard (4:3)</SelectItem>
                      <SelectItem value="3:4">Portrait doux (3:4)</SelectItem>
                      <SelectItem value="21:9">Bannière (21:9)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Style additionnel</Label>
                  <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="ex. infographie, schéma scientifique…" className="mt-1" />
                </div>
              </TabsContent>

              <TabsContent value="comic" className="mt-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Format</Label>
                    <Select value={aspect} onValueChange={setAspect}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">Planche carrée (1:1)</SelectItem>
                        <SelectItem value="4:3">Planche 4:3</SelectItem>
                        <SelectItem value="3:4">Planche 3:4</SelectItem>
                        <SelectItem value="16:9">Bandeau 16:9</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Style BD additionnel</Label>
                    <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="ex. ligne claire, manga…" className="mt-1" />
                  </div>
                </div>

                {/* Scenario flow */}
                <div className="rounded-lg border bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium">Étape 1 — Scénario en 4 cases</div>
                    <Button size="sm" variant="outline" onClick={generateScenario} disabled={genScenarioLoading}>
                      {genScenarioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {scenario ? "Régénérer" : "Générer le scénario"}
                    </Button>
                  </div>
                  {scenario ? (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold">{scenario.title}</div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {scenario.panels.map((p, i) => (
                          <div key={i} className="rounded-md border p-2 space-y-1">
                            <div className="text-xs text-muted-foreground">Case {i + 1}</div>
                            <Textarea value={p.scene} onChange={(e) => updatePanel(i, "scene", e.target.value)} className="text-xs min-h-[60px]" placeholder="Scène" />
                            <Input value={p.bubble} onChange={(e) => updatePanel(i, "bubble", e.target.value)} className="text-xs" placeholder="Bulle" />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {scenarioValidated ? (
                          <>
                            <Badge className="gap-1 bg-emerald-600"><Check className="h-3 w-3" /> Scénario validé</Badge>
                            <Button size="sm" variant="ghost" onClick={() => setScenarioValidated(false)}><X className="h-4 w-4" /> Modifier</Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setScenarioValidated(true)}><Check className="h-4 w-4" /> Valider le scénario</Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Génère puis ajuste le texte de chaque case avant de créer l'image finale.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="chart" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">L'IA choisit le type pertinent (barres, ligne, aire, camembert).</p>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Citer les sources</Label>
                    <p className="text-xs text-muted-foreground">L'IA doit indiquer la source/section pour chaque série.</p>
                  </div>
                  <Switch checked={requireCitations} onCheckedChange={setRequireCitations} />
                </div>
              </TabsContent>
              <TabsContent value="table" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">Tableau comparatif structuré, exportable en CSV.</p>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Citer les sources</Label>
                    <p className="text-xs text-muted-foreground">L'IA doit indiquer la source/section pour chaque ligne.</p>
                  </div>
                  <Switch checked={requireCitations} onCheckedChange={setRequireCitations} />
                </div>
              </TabsContent>
            </Tabs>

            <div>
              <Label className="text-sm">Que veux-tu visualiser ?</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "image" ? "ex. Schéma annoté du cycle de l'eau" :
                  mode === "comic" ? "ex. Explique la photosynthèse en BD" :
                  mode === "chart" ? "ex. Compare la consommation d'énergie par secteur" :
                  "ex. Tableau comparatif des règnes du vivant"
                }
                className="mt-1 min-h-[80px]"
              />
            </div>

            <Button
              onClick={() => generate()}
              disabled={loading || (mode === "comic" && !scenarioValidated)}
              size="lg"
              className="w-full text-[oklch(0.2_0.02_80)] font-semibold"
              style={{ background: "var(--gradient-gold)" }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</> :
                mode === "comic" ? <><Sparkles className="h-4 w-4" /> Étape 2 — Créer l'image BD</> :
                <><Sparkles className="h-4 w-4" /> Générer</>}
            </Button>
          </div>
        </Card>

        {/* Current results */}
        {imageUrl && (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="font-semibold">{mode === "comic" ? "BD pédagogique" : "Image générée"}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={regenerate}><RefreshCw className="h-4 w-4" /> Régénérer</Button>
                <Button size="sm" variant="outline" onClick={downloadImage}><Download className="h-4 w-4" /> Télécharger</Button>
              </div>
            </div>
            <img src={imageUrl} alt={prompt} className="w-full rounded-lg border" />
            <VersionStrip activeItem={activeItem} versionsCount={versionsCount} currentIdx={currentVersionIdx} onRestore={restoreVersion} onCompare={openDiff} />
          </Card>
        )}

        {chart && (
          <Card className="p-5 mb-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-lg font-semibold">{chart.title}</h2>
                {chart.description && <p className="text-sm text-muted-foreground mt-1">{chart.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={regenerate}><RefreshCw className="h-4 w-4" /> Régénérer</Button>
            </div>
            <div className="h-80 mt-4" ref={chartRef}>
              <ResponsiveContainer width="100%" height="100%">
                {chart.chartType === "bar" ? (
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} /><YAxis /><Tooltip /><Legend />
                    {chart.series.map((s, i) => <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={PALETTE[i % PALETTE.length]} />)}
                  </BarChart>
                ) : chart.chartType === "line" ? (
                  <LineChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} /><YAxis /><Tooltip /><Legend />
                    {chart.series.map((s, i) => <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} />)}
                  </LineChart>
                ) : chart.chartType === "area" ? (
                  <AreaChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} /><YAxis /><Tooltip /><Legend />
                    {chart.series.map((s, i) => <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.3} />)}
                  </AreaChart>
                ) : (
                  <PieChart>
                    <Tooltip /><Legend />
                    <Pie data={chart.data} dataKey={chart.series[0]?.dataKey} nameKey={chart.xKey} outerRadius={110} label>
                      {chart.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-sm rounded-lg bg-secondary/50 p-3"><span className="font-semibold">💡 Insight :</span> {chart.insight}</p>
            {chart.citations?.length ? (
              <div className="mt-2 text-xs rounded-lg border p-3">
                <div className="font-semibold mb-1">📌 Sources citées</div>
                <ul className="list-disc pl-4 space-y-0.5">{chart.citations.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            ) : null}
            <VersionStrip activeItem={activeItem} versionsCount={versionsCount} currentIdx={currentVersionIdx} onRestore={restoreVersion} onCompare={openDiff} />
          </Card>
        )}

        {table && (
          <Card className="p-5 mb-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <h2 className="text-lg font-semibold">{table.title}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={regenerate}><RefreshCw className="h-4 w-4" /> Régénérer</Button>
                <Button size="sm" variant="outline" onClick={exportTableCsv}><Download className="h-4 w-4" /> CSV</Button>
              </div>
            </div>
            {table.description && <p className="text-sm text-muted-foreground mb-3">{table.description}</p>}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>{table.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {row.map((cell, j) => <td key={j} className="px-3 py-2 align-top">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm rounded-lg bg-secondary/50 p-3"><span className="font-semibold">💡 Insight :</span> {table.insight}</p>
            {table.citations?.length ? (
              <div className="mt-2 text-xs rounded-lg border p-3">
                <div className="font-semibold mb-1">📌 Sources citées</div>
                <ul className="list-disc pl-4 space-y-0.5">{table.citations.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            ) : null}
            <VersionStrip activeItem={activeItem} versionsCount={versionsCount} currentIdx={currentVersionIdx} onRestore={restoreVersion} onCompare={openDiff} />
          </Card>
        )}

        {/* Session list */}
        {session.length > 0 && (
          <Card className="p-5 mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><FileDown className="h-4 w-4" /> Session en cours ({session.length})</h2>
              <Button size="sm" onClick={exportSessionPdf} className="text-[oklch(0.2_0.02_80)]" style={{ background: "var(--gradient-gold)" }}>
                <Download className="h-4 w-4" /> Télécharger PDF
              </Button>
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={currentSessionName || "Nom de la session (ex. Photosynthèse — révisions)"}
                className="flex-1 min-w-[200px]"
              />
              <Button size="sm" variant="outline" onClick={saveCurrentSession} className="gap-1.5">
                <Save className="h-4 w-4" /> {currentSessionId ? "Mettre à jour" : "Sauvegarder"}
              </Button>
              {currentSessionId && (
                <Button size="sm" variant="ghost" onClick={() => { saveStudioSession({ name: (saveName || currentSessionName || "Copie").trim(), items: session, theme: { themeId, customPalette, customFont, customVibe }, lastPrompt: prompt, lastMode: mode }); setHistory(listStudioSessions()); toast.success("Copie créée"); }}>
                  Enregistrer comme nouvelle
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {session.map((it) => (
                <li
                  key={it.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-sm cursor-pointer transition-colors ${activeItemId === it.id ? "border-primary bg-primary/5" : "hover:bg-secondary/40"}`}
                  onClick={() => selectSessionItem(it.id)}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Badge variant="outline" className="uppercase text-[10px]">{it.mode}</Badge>
                    <span className="truncate">{it.prompt}</span>
                    {it.versions && it.versions.length > 1 && (
                      <Badge variant="secondary" className="text-[10px] gap-1"><History className="h-3 w-3" />{it.versions.length} versions</Badge>
                    )}
                  </span>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); removeSessionItem(it.id); }}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* History panel */}
        <Card className="p-5 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Historique des sessions Studio</h2>
            <Badge variant="outline" className="ml-auto text-xs">{history.length} sauvegardée{history.length > 1 ? "s" : ""}</Badge>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune session sauvegardée. Génère des visuels puis clique « Sauvegarder » pour la garder en mémoire.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((s) => (
                <li key={s.id} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${currentSessionId === s.id ? "border-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.updatedAt).toLocaleString("fr-FR")} • {s.items.length} élément{s.items.length > 1 ? "s" : ""}
                      {s.lastMode ? ` • dernier : ${s.lastMode}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openSavedSession(s)} className="gap-1.5">
                    <FolderOpen className="h-4 w-4" /> Rouvrir
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeSavedSession(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>

      <DiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        item={activeItem}
        leftIdx={diffLeft}
        rightIdx={diffRight}
      />
    </div>
  );
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const r = await fetch(url);
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function VersionStrip({
  activeItem,
  versionsCount,
  currentIdx,
  onRestore,
  onCompare,
}: {
  activeItem: SessionItem | null;
  versionsCount: number;
  currentIdx: number;
  onRestore: (i: number) => void;
  onCompare: (a: number, b: number) => void;
}) {
  if (!activeItem || versionsCount <= 1) return null;
  const versions = activeItem.versions ?? [];
  return (
    <div className="mt-3 rounded-lg border bg-card/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Historique de ce visuel</span>
        <Badge variant="outline" className="text-[10px]">{versionsCount} versions</Badge>
        <span className="ml-auto text-xs text-muted-foreground">Version actuelle : v{currentIdx + 1}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {versions.map((v, i) => {
          const isActive = i === currentIdx;
          return (
            <button
              key={i}
              onClick={() => onRestore(i)}
              className={`group relative rounded-md border px-2 py-1.5 text-xs transition-colors ${isActive ? "border-primary bg-primary/10" : "hover:bg-secondary/40"}`}
              title={`Restaurer v${i + 1} — ${new Date(v.at).toLocaleTimeString("fr-FR")}`}
            >
              <div className="flex items-center gap-1.5">
                {v.imageUrl ? (
                  <img src={v.imageUrl} alt={`v${i + 1}`} className="h-8 w-8 rounded object-cover border" />
                ) : (
                  <span className="h-8 w-8 rounded border bg-secondary/60 flex items-center justify-center">
                    {v.chart ? <BarChart3 className="h-4 w-4" /> : <TableIcon className="h-4 w-4" />}
                  </span>
                )}
                <span className="font-medium">v{i + 1}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">{new Date(v.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground">Clique sur une version pour la restaurer. Compare deux versions pour voir précisément ce qui a changé.</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Comparer :</span>
          {versions.length >= 2 && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onCompare(Math.max(0, currentIdx - 1), currentIdx)}>
                <GitCompare className="h-3 w-3" /> v{Math.max(0, currentIdx - 1) + 1} ↔ v{currentIdx + 1}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onCompare(0, versions.length - 1)}>
                v1 ↔ v{versions.length}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Diff helpers + dialog ----------------

type DiffPart = { type: "same" | "add" | "del"; value: string };

/** Word-level LCS diff for prompts and short text. */
function diffWords(a: string, b: string): DiffPart[] {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const n = aw.length, m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) { out.push({ type: "same", value: aw[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", value: aw[i] }); i++; }
    else { out.push({ type: "add", value: bw[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", value: aw[i++] }); }
  while (j < m) { out.push({ type: "add", value: bw[j++] }); }
  return out;
}

function PromptDiff({ a, b }: { a: string; b: string }) {
  const parts = diffWords(a, b);
  return (
    <div className="rounded-md border bg-card/40 p-3 text-sm leading-relaxed">
      {parts.map((p, i) => {
        if (p.type === "same") return <span key={i}>{p.value}</span>;
        if (p.type === "add") return <span key={i} className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded px-0.5">{p.value}</span>;
        return <span key={i} className="bg-red-500/20 text-red-700 dark:text-red-300 line-through rounded px-0.5">{p.value}</span>;
      })}
    </div>
  );
}

function ChartDiff({ a, b }: { a: ChartData; b: ChartData }) {
  const fields: { label: string; va: string; vb: string }[] = [
    { label: "Titre", va: a.title, vb: b.title },
    { label: "Type", va: a.chartType, vb: b.chartType },
    { label: "Axe X", va: a.xKey, vb: b.xKey },
    { label: "Séries", va: a.series.map((s) => s.name).join(", "), vb: b.series.map((s) => s.name).join(", ") },
    { label: "Nb. points", va: String(a.data.length), vb: String(b.data.length) },
    { label: "Insight", va: a.insight, vb: b.insight },
  ];
  return (
    <div className="space-y-2">
      {fields.map((f) => {
        const changed = f.va !== f.vb;
        return (
          <div key={f.label} className={`rounded-md border p-2 text-xs ${changed ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
            <div className="font-semibold mb-1 flex items-center gap-2">
              {f.label} {changed && <Badge variant="outline" className="text-[9px]">modifié</Badge>}
            </div>
            {changed ? <PromptDiff a={f.va} b={f.vb} /> : <div className="text-muted-foreground">{f.va}</div>}
          </div>
        );
      })}
    </div>
  );
}

function TableDiff({ a, b }: { a: TableData; b: TableData }) {
  const fields: { label: string; va: string; vb: string }[] = [
    { label: "Titre", va: a.title, vb: b.title },
    { label: "Colonnes", va: a.columns.join(" | "), vb: b.columns.join(" | ") },
    { label: "Nb. lignes", va: String(a.rows.length), vb: String(b.rows.length) },
    { label: "Insight", va: a.insight, vb: b.insight },
  ];
  return (
    <div className="space-y-2">
      {fields.map((f) => {
        const changed = f.va !== f.vb;
        return (
          <div key={f.label} className={`rounded-md border p-2 text-xs ${changed ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
            <div className="font-semibold mb-1 flex items-center gap-2">
              {f.label} {changed && <Badge variant="outline" className="text-[9px]">modifié</Badge>}
            </div>
            {changed ? <PromptDiff a={f.va} b={f.vb} /> : <div className="text-muted-foreground">{f.va}</div>}
          </div>
        );
      })}
    </div>
  );
}

function DiffDialog({
  open, onOpenChange, item, leftIdx, rightIdx,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: SessionItem | null;
  leftIdx: number | null;
  rightIdx: number | null;
}) {
  if (!item || leftIdx === null || rightIdx === null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }
  const versions = item.versions ?? [];
  const left = versions[leftIdx];
  const right = versions[rightIdx];
  if (!left || !right) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comparaison impossible</DialogTitle>
            <DialogDescription>Versions introuvables.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" /> Diff — v{leftIdx + 1} ↔ v{rightIdx + 1}
          </DialogTitle>
          <DialogDescription>
            Rouge = retiré (v{leftIdx + 1}) • Vert = ajouté (v{rightIdx + 1}). Les sections marquées « modifié » ont changé entre les deux versions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h3 className="text-sm font-semibold mb-2">Prompt</h3>
            <PromptDiff a={left.prompt} b={right.prompt} />
            <div className="mt-1 text-[11px] text-muted-foreground">
              v{leftIdx + 1} • {new Date(left.at).toLocaleString("fr-FR")} → v{rightIdx + 1} • {new Date(right.at).toLocaleString("fr-FR")}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Contenu</h3>
            {left.imageUrl && right.imageUrl ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">v{leftIdx + 1}</div>
                  <img src={left.imageUrl} alt={`v${leftIdx + 1}`} className="w-full rounded-lg border" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">v{rightIdx + 1}</div>
                  <img src={right.imageUrl} alt={`v${rightIdx + 1}`} className="w-full rounded-lg border" />
                </div>
              </div>
            ) : left.chart && right.chart ? (
              <ChartDiff a={left.chart} b={right.chart} />
            ) : left.table && right.table ? (
              <TableDiff a={left.table} b={right.table} />
            ) : (
              <p className="text-sm text-muted-foreground">Les deux versions n'ont pas le même type de contenu — comparaison limitée au prompt.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
    </div>
  );
}
