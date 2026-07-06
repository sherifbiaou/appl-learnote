import { Link } from "@tanstack/react-router";
import markUrl from "/learnote-mark.png?url";

export function Brand({ to = "/" }: { to?: "/" | "/quiz" | "/results" | "/summary" | "/formulas" | "/exam" }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 group">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-card ring-1 ring-border shadow-[var(--shadow-soft)] transition-transform group-hover:scale-105 overflow-hidden"
      >
        <img src={markUrl} alt="learnote" className="h-7 w-7 object-contain" width={28} height={28} />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-2xl leading-none tracking-tight">
          learn<span className="text-primary">note</span>
          <span className="text-accent">.</span>
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Étudier avec l'IA
        </span>
      </div>
    </Link>
  );
}

// Kept for backward compatibility with any lingering imports.
export function ShefMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      {/* zigzag rising curve */}
      <path
        d="M3 22 L9 14 L13 19 L19 9 L23 14 L29 6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* crescent dot */}
      <circle cx="26" cy="24" r="2.4" fill="currentColor" />
    </svg>
  );
}