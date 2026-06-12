import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { getProblem, listProblemSubmissions } from "@/lib/api";
import { IconLock } from "@/components/pixel-icons";

export const dynamic = "force-dynamic";

const VERDICT_COLOR: Record<string, string> = {
  AC: "text-emerald-600",
  WA: "text-rose-600",
  TLE: "text-amber-600",
  MLE: "text-amber-600",
  RE: "text-rose-600",
  CE: "text-fuchsia-600",
  IE: "text-zinc-500",
};

export default async function ProblemSubmissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const [problem, data] = await Promise.all([
    getProblem(slug),
    listProblemSubmissions(slug),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-5">
      <div>
        <Link href={`/problems/${slug}`} className="text-sm text-zinc-500 hover:underline">
          ← {problem.title}
        </Link>
        <h1 className="text-3xl font-bold mt-1">All submissions</h1>
      </div>

      {!data.viewer_passed && (
        <p className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2"><IconLock /> Solve this problem with a full score to view other members&apos; source code.</span>
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2">Who</th>
            <th className="py-2">Lang</th>
            <th className="py-2">Verdict</th>
            <th className="py-2 text-right">Score</th>
            <th className="py-2 text-right">Time</th>
            <th className="py-2 text-right">When</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-zinc-500">
                No submissions yet.
              </td>
            </tr>
          )}
          {data.rows.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
              <td className="py-2">
                {s.user_username ? (
                  <Link href={`/u/${s.user_username}`} className="hover:underline">
                    <span className={s.is_mine ? "font-semibold" : ""}>{s.user_name}</span>
                  </Link>
                ) : (
                  <span className={s.is_mine ? "font-semibold" : ""}>{s.user_name}</span>
                )}
                {s.is_mine && <span className="ml-1 text-xs text-zinc-400">(you)</span>}
                {!s.can_view_source && (
                  <span className="ml-1 inline-flex align-middle text-[rgb(var(--fg-dim))]" title="source locked">
                    <IconLock size={12} />
                  </span>
                )}
                <Link href={`/submissions/${s.id}`} className="ml-2 text-xs text-zinc-400 hover:underline">
                  view
                </Link>
              </td>
              <td className="py-2 text-zinc-500">{s.language === "cpp" ? "C++" : "Py"}</td>
              <td className="py-2 font-mono">
                {s.status !== "done" ? (
                  <span className="text-zinc-400">{s.status}</span>
                ) : (
                  <span className={VERDICT_COLOR[s.overall_verdict ?? ""] ?? ""}>
                    {s.overall_verdict}
                  </span>
                )}
              </td>
              <td className="py-2 text-right font-mono">{s.total_score}</td>
              <td className="py-2 text-right font-mono text-zinc-500">{s.max_time_ms}ms</td>
              <td className="py-2 text-right text-zinc-500">
                {new Date(s.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
