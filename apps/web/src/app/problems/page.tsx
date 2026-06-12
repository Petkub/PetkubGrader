import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { listProblems, listTopics } from "@/lib/api";
import { PageHeader, ScoreChip, ProgressBar } from "@/components/ui";
import { IconCheck, IconPartial, IconEmpty } from "@/components/pixel-icons";
import { ProblemSearch } from "@/components/problem-search";

export const dynamic = "force-dynamic";

function buildHref(q: string | undefined, topics: string[]) {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  for (const t of topics) u.append("topic", t);
  const qs = u.toString();
  return `/problems${qs ? "?" + qs : ""}`;
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; topic?: string | string[] }>;
}) {
  await requireUser();
  const params = await searchParams;
  const selected = Array.isArray(params.topic) ? params.topic : params.topic ? [params.topic] : [];
  const [problems, allTopics] = await Promise.all([
    listProblems({ q: params.q, topics: selected }),
    listTopics(),
  ]);
  const selectedSet = new Set(selected);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <PageHeader title="Problems" subtitle={`${problems.length} problem${problems.length === 1 ? "" : "s"}`} />

      <ProblemSearch />

      {/* Collapsible topic filter — closed unless filters are active */}
      <details className="surface" {...(selected.length ? { open: true } : {})}>
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-label uppercase tracking-wide flex items-center justify-between">
          <span>Filter by topic{selected.length ? ` (${selected.length})` : ""}</span>
          {selected.length > 0 && (
            <Link href={buildHref(params.q, [])} className="text-xs text-[rgb(var(--cyan))] normal-case">
              clear
            </Link>
          )}
        </summary>
        <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2 border-t border-[rgb(var(--border))]">
          {allTopics.map((t) => {
            const on = selectedSet.has(t.slug);
            const next = on ? selected.filter((s) => s !== t.slug) : [...selected, t.slug];
            return (
              <Link
                key={t.id}
                href={buildHref(params.q, next)}
                className={`pixel-chip px-2 py-0.5 text-xs ${
                  on
                    ? "bg-[rgb(var(--accent))] text-black"
                    : "bg-[rgb(var(--bg-2))] text-[rgb(var(--fg-muted))]"
                }`}
              >
                {t.name}
              </Link>
            );
          })}
        </div>
      </details>

      <div className="surface divide-y divide-[rgb(var(--border))] overflow-hidden">
        {problems.length === 0 && (
          <div className="px-4 py-10 text-center text-[rgb(var(--fg-muted))]">No problems found.</div>
        )}
        {problems.map((p) => (
          <Link
            key={p.id}
            href={`/problems/${p.slug}`}
            className="flex items-center gap-4 px-4 py-3.5 surface-hover transition group"
          >
            <span className="w-5 flex justify-center">
              {p.your_best_score === 100 ? (
                <IconCheck className="text-[rgb(var(--ac))]" />
              ) : p.your_best_score > 0 ? (
                <IconPartial className="text-[rgb(var(--tle))]" />
              ) : (
                <IconEmpty className="text-[rgb(var(--fg-dim))]" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium group-hover:text-[rgb(var(--cyan))] transition">{p.title}</div>
              <div className="mt-1.5 w-32">
                <ProgressBar value={p.your_best_score} />
              </div>
            </div>
            <ScoreChip score={p.your_best_score} />
          </Link>
        ))}
      </div>
    </main>
  );
}
