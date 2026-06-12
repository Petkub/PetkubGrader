import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { getContest, getScoreboard } from "@/lib/api";
import { RankBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ScoreboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const [c, rows] = await Promise.all([getContest(slug), getScoreboard(slug)]);
  const aliases = c.problems.map((p) => p.alias);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-5">
      <div>
        <Link href={`/contests/${slug}`} className="text-sm text-zinc-500 hover:underline">
          ← {c.title}
        </Link>
        <h1 className="text-3xl font-bold mt-1">Scoreboard</h1>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 w-10">#</th>
            <th className="py-2">User</th>
            {aliases.map((a) => (
              <th key={a} className="py-2 text-center font-mono w-12">{a}</th>
            ))}
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={aliases.length + 3} className="py-6 text-center text-zinc-500">
                No submissions yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-[rgb(var(--border))]">
              <td className="py-2"><RankBadge rank={r.rank} /></td>
              <td className="py-2 font-medium">
                {r.username ? (
                  <Link href={`/u/${r.username}`} className="hover:text-[rgb(var(--cyan))] transition">{r.name}</Link>
                ) : (
                  r.name
                )}
              </td>
              {aliases.map((a) => (
                <td key={a} className="py-2 text-center font-mono text-sm">
                  {r.per_problem[a] != null ? (
                    <span className={r.per_problem[a] === 100 ? "text-emerald-300" : "text-amber-300"}>
                      {r.per_problem[a]}
                    </span>
                  ) : (
                    <span className="text-[rgb(var(--fg-dim))]">·</span>
                  )}
                </td>
              ))}
              <td className="py-2 text-right font-mono font-bold text-gradient">{r.total_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
