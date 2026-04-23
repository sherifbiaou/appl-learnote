import { Link } from "@tanstack/react-router";

export function Brand({ to = "/" }: { to?: "/" | "/quiz" | "/results" | "/summary" | "/formulas" | "/exam" }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 group">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl shadow-[var(--shadow-soft)] transition-transform group-hover:scale-105"
        style={{ background: "var(--gradient-gold)" }}
      >
        <ShefMark className="h-6 w-6 text-[oklch(0.2_0.02_80)]" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight">
          Shef<span className="text-primary"> AI</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Tuteur intelligent
        </span>
      </div>
    </Link>
  );
}

// Stylized zigzag/crescent monogram for Shef AI
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