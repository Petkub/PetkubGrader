import { requireUser } from "@/lib/guard";
import { getSubmission } from "@/lib/api";
import { VerdictBadge, VERDICT_TONE } from "@/components/ui";
import { IconTrophy, IconLock } from "@/components/pixel-icons";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sub = await getSubmission(id);
  const finished = sub.status === "done" || sub.status === "error";

  const bySubtask = new Map<string, typeof sub.testcases>();
  for (const tc of sub.testcases) {
    if (!bySubtask.has(tc.subtask_id)) bySubtask.set(tc.subtask_id, []);
    bySubtask.get(tc.subtask_id)!.push(tc);
  }
  const orderedSubtasks = [...sub.subtasks].sort((a, b) =>
    a.is_sample === b.is_sample ? a.ord - b.ord : a.is_sample ? -1 : 1,
  );

  const ac = sub.overall_verdict === "AC";

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {!finished && <meta httpEquiv="refresh" content="1" />}

      {/* Result hero */}
      <div
        className={`rounded-2xl p-6 flex items-center justify-between ${
          !finished
            ? "surface"
            : ac
            ? "bg-gradient-to-r from-emerald-600/30 to-emerald-500/10 border border-emerald-500/30"
            : "bg-gradient-to-r from-rose-600/25 to-rose-500/10 border border-rose-500/30"
        }`}
      >
        <div>
          <div className="text-xs uppercase tracking-wider text-[rgb(var(--fg-muted))]">
            {sub.language === "cpp" ? "C++" : "Python"} · {finished ? "judged" : sub.status}
          </div>
          <div className="mt-1 flex items-center gap-3">
            {!finished ? (
              <span className="text-2xl font-bold flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                Judging…
              </span>
            ) : (
              <span
                className={`animate-pop font-pixel text-lg inline-flex items-center gap-2 ${
                  ac ? "text-[rgb(var(--ac))]" : "text-[rgb(var(--wa))]"
                }`}
              >
                {ac && <IconTrophy size={20} />}
                {ac ? "Accepted" : sub.overall_verdict}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold text-gradient">{sub.total_score}</div>
          <div className="text-xs text-[rgb(var(--fg-muted))]">/ 100</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="surface rounded-xl p-3">
          <div className="text-[rgb(var(--fg-dim))] text-xs">Max time</div>
          <div className="font-mono">{sub.max_time_ms} ms</div>
        </div>
        <div className="surface rounded-xl p-3">
          <div className="text-[rgb(var(--fg-dim))] text-xs">Max memory</div>
          <div className="font-mono">{(sub.max_memory_kb / 1024).toFixed(1)} MB</div>
        </div>
        <div className="surface rounded-xl p-3">
          <div className="text-[rgb(var(--fg-dim))] text-xs">Verdict</div>
          <div><VerdictBadge verdict={sub.overall_verdict} /></div>
        </div>
      </div>

      {sub.compile_log && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">Compile log</h2>
          <pre className="text-xs p-3 rounded-xl bg-[#0b0b12] border border-[rgb(var(--border))] overflow-x-auto">{sub.compile_log}</pre>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">Testcases</h2>
        {orderedSubtasks.map((st) => {
          const cases = bySubtask.get(st.id) ?? [];
          return (
            <div key={st.id} className="surface rounded-xl p-3">
              <div className="text-xs mb-2 flex items-center gap-2">
                <span className="font-medium">{st.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-[rgb(var(--surface-2))] text-[rgb(var(--fg-muted))]">
                  {st.is_sample ? "samples · 0 pts" : `${st.weight} pts`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cases.map((tc, j) => (
                  <div
                    key={tc.testcase_id}
                    title={`#${j + 1}${tc.time_ms ? ` · ${tc.time_ms}ms` : ""}`}
                    className={`px-2 py-1 rounded-md text-xs font-mono border ${
                      tc.verdict ? VERDICT_TONE[tc.verdict] ?? VERDICT_TONE.IE : "bg-[rgb(var(--surface-2))] text-[rgb(var(--fg-dim))] border-[rgb(var(--border))]"
                    }`}
                  >
                    {tc.verdict ?? "…"}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {sub.can_view_source && sub.source && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">Source</h2>
          <pre className="text-xs p-3 rounded-xl bg-[#0b0b12] border border-[rgb(var(--border))] overflow-x-auto font-mono">{sub.source}</pre>
        </section>
      )}
      {!sub.can_view_source && (
        <p className="text-sm text-[rgb(var(--fg-muted))] inline-flex items-center gap-2">
          <IconLock /> Source hidden until you reach 100 on this problem.
        </p>
      )}
    </main>
  );
}
