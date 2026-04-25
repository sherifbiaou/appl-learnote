import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { Loader2, ImageIcon, BookOpenCheck, BarChart3, Table as TableIcon, Sparkles, Download, BookOpen, Sigma, Timer } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

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
}
interface TableData {
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
  insight: string;
}

const PALETTE = ["#d4a017", "#7aa2ff", "#9b6dff", "#ff8a5b", "#3ec9a7", "#e64980"];

function StudioPage() {
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [table, setTable] = useState<TableData | null>(null);

  useEffect(() => { setSources(loadSources()); }, []);

  const reset = () => { setImageUrl(null); setChart(null); setTable(null); };

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Décris ce que tu veux générer."); return; }
    setLoading(true);
    reset();
    try {
      const payload = sources.map((s) => ({ kind: s.kind, label: s.label, content: s.content, dataUrl: s.dataUrl, mimeType: s.mimeType }));
      const { data, error } = await supabase.functions.invoke("visual-studio", {
        body: { mode, sources: payload, prompt, aspect, style },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      if (mode === "image" || mode === "comic") setImageUrl((data as any).imageUrl);
      else if (mode === "chart") setChart(data as ChartData);
      else if (mode === "table") setTable(data as TableData);
      toast.success("Généré !");
    } catch (e: any) {
      toast.error(e.message || "Erreur de génération");
    } finally { setLoading(false); }
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
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3 gap-1"><Sparkles className="h-3 w-3" /> Studio visuel SmartQuiz</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Visualise pour mieux comprendre</h1>
          <p className="mt-2 text-muted-foreground">Image, BD pédagogique, graphique ou tableau — basés sur tes sources et ta demande.</p>
          <p className="mt-1 text-xs text-muted-foreground">📚 {sources.length} source{sources.length > 1 ? "s" : ""} chargée{sources.length > 1 ? "s" : ""}.</p>
        </div>

        <Card className="p-6 relative overflow-hidden mb-6">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "var(--pattern-zigzag)" }} />
          <div className="relative space-y-5">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset(); }}>
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
                  <Label className="text-sm">Style (optionnel)</Label>
                  <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="ex. infographie, aquarelle, schéma scientifique…" className="mt-1" />
                </div>
              </TabsContent>

              <TabsContent value="comic" className="mt-4 grid sm:grid-cols-2 gap-3">
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
                  <Label className="text-sm">Style BD (optionnel)</Label>
                  <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="ex. ligne claire, manga, cartoon doux…" className="mt-1" />
                </div>
              </TabsContent>

              <TabsContent value="chart" className="mt-4 text-sm text-muted-foreground">
                L'IA choisit le type pertinent (barres, ligne, aire ou camembert) selon ta demande et tes sources.
              </TabsContent>
              <TabsContent value="table" className="mt-4 text-sm text-muted-foreground">
                Tableau comparatif structuré, exportable en CSV.
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

            <Button onClick={generate} disabled={loading} size="lg" className="w-full text-[oklch(0.2_0.02_80)] font-semibold" style={{ background: "var(--gradient-gold)" }}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</> : <><Sparkles className="h-4 w-4" /> Générer</>}
            </Button>
          </div>
        </Card>

        {/* Results */}
        {imageUrl && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{mode === "comic" ? "BD pédagogique" : "Image générée"}</h2>
              <Button size="sm" variant="outline" onClick={downloadImage}><Download className="h-4 w-4" /> Télécharger</Button>
            </div>
            <img src={imageUrl} alt={prompt} className="w-full rounded-lg border" />
          </Card>
        )}

        {chart && (
          <Card className="p-5">
            <h2 className="text-lg font-semibold">{chart.title}</h2>
            {chart.description && <p className="text-sm text-muted-foreground mt-1">{chart.description}</p>}
            <div className="h-80 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                {chart.chartType === "bar" ? (
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {chart.series.map((s, i) => <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={PALETTE[i % PALETTE.length]} />)}
                  </BarChart>
                ) : chart.chartType === "line" ? (
                  <LineChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {chart.series.map((s, i) => <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} />)}
                  </LineChart>
                ) : chart.chartType === "area" ? (
                  <AreaChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey={chart.xKey} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {chart.series.map((s, i) => <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.3} />)}
                  </AreaChart>
                ) : (
                  <PieChart>
                    <Tooltip />
                    <Legend />
                    <Pie data={chart.data} dataKey={chart.series[0]?.dataKey} nameKey={chart.xKey} outerRadius={110} label>
                      {chart.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-sm rounded-lg bg-secondary/50 p-3"><span className="font-semibold">💡 Insight :</span> {chart.insight}</p>
          </Card>
        )}

        {table && (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-lg font-semibold">{table.title}</h2>
              <Button size="sm" variant="outline" onClick={exportTableCsv}><Download className="h-4 w-4" /> CSV</Button>
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
          </Card>
        )}
      </main>
    </div>
  );
}
