import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brand } from "@/components/Brand";
import { ThemePicker } from "@/components/ThemePicker";
import { toast } from "sonner";
import { Download, Palette, FileCode, Image as ImageIcon, Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/brand-kit")({
  head: () => ({
    meta: [
      { title: "Kit de marque learnote — Téléchargez logos, favicon et meta tags" },
      { name: "description", content: "Téléchargez le kit de marque learnote : favicon, icônes PWA, palette Émeraude Prestige et meta tags prêts à copier pour vos déploiements." },
      { property: "og:title", content: "Kit de marque learnote" },
      { property: "og:description", content: "Favicon, icônes, palette et meta tags — tout pour déployer aux couleurs learnote." },
    ],
  }),
  component: BrandKitPage,
});

const PRIMARY = "#0d7a5f";
const BACKGROUND = "#f5f0e0";
const GOLD = "#c9a84c";

const METATAGS = `<!-- learnote — Head meta tags -->
<title>learnote — Étudier plus vite avec l'IA</title>
<meta name="description" content="Quiz, résumés et examens adaptatifs générés depuis vos cours, PDFs, vidéos et notes." />
<meta name="theme-color" content="${PRIMARY}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/learnote-mark.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta property="og:title" content="learnote — Étudier plus vite avec l'IA" />
<meta property="og:description" content="Quiz, résumés, formules et examens adaptatifs générés depuis vos ressources." />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
`;

const PALETTE_CSS = `/* learnote — Palette Émeraude Prestige */
:root {
  --learnote-emerald: ${PRIMARY};
  --learnote-emerald-deep: #064e3b;
  --learnote-gold: ${GOLD};
  --learnote-cream: ${BACKGROUND};
  --learnote-ink: #1a2f24;
}
`;

const MANIFEST = `{
  "name": "learnote",
  "short_name": "learnote",
  "start_url": "/",
  "display": "standalone",
  "background_color": "${BACKGROUND}",
  "theme_color": "${PRIMARY}",
  "icons": [
    { "src": "/learnote-mark.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/learnote-mark.png", "sizes": "512x512", "type": "image/png" }
  ]
}
`;

const README = `# Kit de marque learnote

Contenu :
- learnote-mark.png — logo principal (usage favicon / PWA / apple-touch-icon)
- favicon.png — favicon 32px
- palette.css — variables CSS de la palette Émeraude Prestige
- meta-tags.html — meta tags à coller dans le <head> de vos déploiements
- manifest.webmanifest — manifest PWA prêt à servir depuis /

Couleurs :
- Émeraude : ${PRIMARY}
- Or / Gold : ${GOLD}
- Cream : ${BACKGROUND}

Typographie : Cormorant Garamond (titres) + Karla (corps).
`;

async function fetchAsBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fichier introuvable : ${url}`);
  return await r.blob();
}

function BrandKitPage() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      const [mark, fav] = await Promise.all([
        fetchAsBlob("/learnote-mark.png"),
        fetchAsBlob("/favicon.png"),
      ]);
      zip.file("learnote-mark.png", mark);
      zip.file("favicon.png", fav);
      zip.file("palette.css", PALETTE_CSS);
      zip.file("meta-tags.html", METATAGS);
      zip.file("manifest.webmanifest", MANIFEST);
      zip.file("README.md", README);
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "learnote-brand-kit.zip";
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("Kit de marque téléchargé");
    } catch (e: any) {
      toast.error(e?.message || "Échec du téléchargement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Brand />
        <div className="flex items-center gap-2">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <ThemePicker />
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 pb-20">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
          Kit de marque <span className="italic" style={{ color: PRIMARY }}>learnote</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Tout ce dont vous avez besoin pour déployer aux couleurs learnote : logo, favicon, meta tags, palette et manifest PWA.
        </p>

        <Card className="mt-8 p-6 shadow-[var(--shadow-card)]">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Aperçu du logo</p>
              <div className="rounded-2xl p-8 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                <img src="/learnote-mark.png" alt="learnote logo" className="h-24 w-24 object-contain" />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Palette</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Émeraude", hex: PRIMARY },
                  { name: "Or", hex: GOLD },
                  { name: "Cream", hex: BACKGROUND },
                ].map((c) => (
                  <div key={c.hex} className="rounded-xl overflow-hidden border">
                    <div className="h-16" style={{ background: c.hex }} />
                    <div className="px-2 py-1.5 text-[10px]">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-muted-foreground font-mono">{c.hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fichiers inclus</p>
            <ul className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
              <li className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> learnote-mark.png</li>
              <li className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> favicon.png</li>
              <li className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> palette.css</li>
              <li className="flex items-center gap-2"><FileCode className="h-4 w-4 text-primary" /> meta-tags.html</li>
              <li className="flex items-center gap-2"><FileCode className="h-4 w-4 text-primary" /> manifest.webmanifest</li>
              <li className="flex items-center gap-2"><FileCode className="h-4 w-4 text-primary" /> README.md</li>
            </ul>
          </div>

          <Button
            size="lg"
            className="mt-6 w-full h-14 text-base font-semibold"
            style={{ background: "var(--gradient-hero)" }}
            onClick={download}
            disabled={busy}
          >
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Préparation du zip…</> : <><Download className="h-5 w-5" /> Télécharger learnote-brand-kit.zip</>}
          </Button>
        </Card>
      </main>
    </div>
  );
}