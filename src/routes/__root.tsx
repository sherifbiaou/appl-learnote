import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { TutorChat } from "@/components/TutorChat";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SmartQuiz— Tuteur intelligent et examens adaptatifs" },
      { name: "description", content: "Plateforme d'apprentissage IA: quiz, résumés, formules expliquées, examens chronométrés adaptatifs." },
      { name: "author", content: "SmartQuiz" },
      { property: "og:title", content: "SmartQuiz— Tuteur intelligent et examens adaptatifs" },
      { property: "og:description", content: "Plateforme d'apprentissage IA: quiz, résumés, formules expliquées, examens chronométrés adaptatifs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@ShefAI" },
      { name: "twitter:title", content: "SmartQuiz— Tuteur intelligent et examens adaptatifs" },
      { name: "twitter:description", content: "Plateforme d'apprentissage IA: quiz, résumés, formules expliquées, examens chronométrés adaptatifs." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ab709b17-36f2-4018-afa1-9d5fd06e31b9" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ab709b17-36f2-4018-afa1-9d5fd06e31b9" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <TutorChat />
      <Toaster richColors position="top-center" />
    </>
  );
}
