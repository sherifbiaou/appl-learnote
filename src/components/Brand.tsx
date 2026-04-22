import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function Brand({ to = "/" }: { to?: "/" | "/quiz" | "/results" }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 group">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gradient-hero)] shadow-[var(--shadow-soft)] transition-transform group-hover:scale-105">
        <Sparkles className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="text-lg font-semibold tracking-tight">
        app<span className="text-primary">Quiz</span>
      </span>
    </Link>
  );
}