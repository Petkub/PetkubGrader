import Link from "next/link";
import type { ReactNode } from "react";
import { IconStar } from "@/components/pixel-icons";

/* ---------- primitives ---------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-pixel text-base sm:text-xl text-[rgb(var(--accent))]">{title}</h1>
        {subtitle && <p className="text-base text-[rgb(var(--fg-muted))] mt-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type BtnProps = {
  children: ReactNode;
  variant?: "primary" | "ghost" | "outline" | "success";
  className?: string;
};
const btnBase =
  "pixel-btn inline-flex items-center justify-center px-4 py-2 font-label text-xs uppercase tracking-wide ring-cyan disabled:opacity-50";
const btnVariant: Record<string, string> = {
  primary: "bg-[rgb(var(--accent))] text-black",
  success: "bg-[rgb(var(--ac))] text-black",
  outline: "bg-[rgb(var(--surface))] text-[rgb(var(--fg))] !border-[rgb(var(--border-strong))]",
  ghost: "!border-transparent !shadow-none text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--accent))]",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${btnBase} ${btnVariant[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }: { href: string } & BtnProps) {
  return (
    <Link href={href} className={`${btnBase} ${btnVariant[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/* ---------- gamified bits ---------- */

const MEDAL: Record<number, string> = {
  1: "bg-[rgb(var(--gold))] text-black",
  2: "bg-[rgb(var(--silver))] text-black",
  3: "bg-[rgb(var(--bronze))] text-black",
};

export function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className={`inline-flex h-8 w-8 items-center justify-center font-pixel text-[10px] border-2 border-black ${MEDAL[rank]}`}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center font-mono text-sm text-[rgb(var(--fg-dim))]">
      {rank}
    </span>
  );
}

export function ScoreChip({ score }: { score: number }) {
  const tone =
    score === 100
      ? "text-[rgb(var(--ac))]"
      : score > 0
      ? "text-[rgb(var(--tle))]"
      : "text-[rgb(var(--fg-dim))]";
  return (
    <span className={`pixel-chip inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-[rgb(var(--bg-2))] ${tone}`}>
      {score === 100 && <IconStar size={10} />}
      {score}
    </span>
  );
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const blocks = 10;
  const filled = Math.round((pct / 100) * blocks);
  return (
    <div className="flex gap-0.5" aria-label={`${pct}%`}>
      {Array.from({ length: blocks }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 ${i < filled ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--surface-2))]"}`}
        />
      ))}
    </div>
  );
}

export const VERDICT_TONE: Record<string, string> = {
  AC: "text-[rgb(var(--ac))]",
  WA: "text-[rgb(var(--wa))]",
  TLE: "text-[rgb(var(--tle))]",
  MLE: "text-[rgb(var(--tle))]",
  RE: "text-[rgb(var(--wa))]",
  CE: "text-[rgb(var(--ce))]",
  IE: "text-[rgb(var(--ie))]",
  SKIP: "text-[rgb(var(--fg-dim))]",
};

export function VerdictBadge({ verdict, className = "" }: { verdict: string | null; className?: string }) {
  if (!verdict) return <span className="text-[rgb(var(--fg-dim))]">—</span>;
  return (
    <span
      className={`pixel-chip inline-flex items-center px-2 py-0.5 text-xs font-mono font-bold bg-[rgb(var(--bg-2))] ${VERDICT_TONE[verdict] ?? VERDICT_TONE.IE} ${className}`}
    >
      {verdict}
    </span>
  );
}

export function StatCard({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`surface p-4 text-center ${accent ? "!bg-[rgb(var(--accent-2))] !border-black text-black" : ""}`}>
      <div className="font-pixel text-lg">{value}</div>
      <div className={`text-xs mt-2 ${accent ? "text-black/70" : "text-[rgb(var(--fg-muted))]"}`}>{label}</div>
    </div>
  );
}

/** Blocky pixel "ring" — segmented arc made of squares. */
export function SolvedRing({ solved, total }: { solved: number; total: number }) {
  return (
    <div className="surface h-20 w-20 flex flex-col items-center justify-center !bg-[rgb(var(--bg-2))]">
      <span className="font-pixel text-base text-[rgb(var(--accent))]">{solved}</span>
      <span className="text-[10px] text-[rgb(var(--fg-muted))]">solved</span>
      <span className="sr-only">of {total}</span>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    upcoming: "text-[rgb(var(--cyan))]",
    running: "text-[rgb(var(--ac))]",
    ended: "text-[rgb(var(--fg-dim))]",
    published: "text-[rgb(var(--ac))]",
    draft: "text-[rgb(var(--tle))]",
  };
  return (
    <span className={`pixel-chip inline-flex items-center px-2 py-0.5 text-xs uppercase font-label bg-[rgb(var(--bg-2))] ${tone[status] ?? tone.ended}`}>
      {status}
    </span>
  );
}

export function Topic({ children }: { children: ReactNode }) {
  return (
    <span className="pixel-chip text-xs px-2 py-0.5 bg-[rgb(var(--bg-2))] text-[rgb(var(--fg-muted))]">
      {children}
    </span>
  );
}
