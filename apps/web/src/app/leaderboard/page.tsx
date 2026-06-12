import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { getRanking } from "@/lib/api";
import { PageHeader, RankBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  await requireUser();
  const rows = await getRanking();

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <PageHeader title="Leaderboard" subtitle="Sum of best score per problem" />

      <div className="surface rounded-xl divide-y divide-[rgb(var(--border))] overflow-hidden">
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[rgb(var(--fg-muted))]">No ranked users yet.</div>
        )}
        {rows.map((r) => (
          <div
            key={r.user_id}
            className={`flex items-center gap-4 px-4 py-3 ${
              r.rank <= 3 ? "bg-gradient-to-r from-[rgb(var(--surface-2))] to-transparent" : ""
            }`}
          >
            <RankBadge rank={r.rank} />
            <div className="flex-1 min-w-0">
              {r.username ? (
                <Link href={`/u/${r.username}`} className="font-medium hover:text-[rgb(var(--cyan))] transition">
                  {r.name}
                </Link>
              ) : (
                <span className="font-medium">{r.name}</span>
              )}
              <div className="text-xs text-[rgb(var(--fg-dim))]">{r.solved} solved</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gradient">{r.total_score}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
