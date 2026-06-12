import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { listMySubmissions } from "@/lib/api";
import { PageHeader, VerdictBadge, ScoreChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MySubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  await requireUser();
  const { problem } = await searchParams;
  const rows = await listMySubmissions({ problem, limit: 100 });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <PageHeader
        title="My submissions"
        subtitle={
          problem ? (
            <>
              filtered: <span className="font-mono">{problem}</span> ·{" "}
              <Link href="/submissions" className="text-[rgb(var(--cyan))] underline">clear</Link>
            </>
          ) : undefined
        }
      />

      <div className="surface rounded-xl divide-y divide-[rgb(var(--border))] overflow-hidden">
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[rgb(var(--fg-muted))]">No submissions yet.</div>
        )}
        {rows.map((s) => (
          <Link
            key={s.id}
            href={`/submissions/${s.id}`}
            className="flex items-center gap-3 px-4 py-3 surface-hover transition"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{s.problem_title}</div>
              <div className="text-xs text-[rgb(var(--fg-dim))] font-mono">
                {s.language === "cpp" ? "C++" : "Py"} · {s.max_time_ms}ms ·{" "}
                {new Date(s.created_at).toLocaleString()}
              </div>
            </div>
            {s.status !== "done" ? (
              <span className="text-xs text-[rgb(var(--fg-dim))]">{s.status}</span>
            ) : (
              <VerdictBadge verdict={s.overall_verdict} />
            )}
            <ScoreChip score={s.total_score} />
          </Link>
        ))}
      </div>
    </main>
  );
}
