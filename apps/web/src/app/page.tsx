import { LinkButton } from "@/components/ui";

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-6">
      <section className="py-24 text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1 text-xs text-[rgb(var(--fg-muted))]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          C++ &amp; Python · subtasks · live + virtual contests
        </div>
        <h1 className="font-pixel text-xl sm:text-3xl leading-[1.7]">
          Train. Compete.
          <br />
          <span className="text-[rgb(var(--accent))]">Climb the board.</span>
        </h1>
        <p className="text-lg text-[rgb(var(--fg-muted))] max-w-xl mx-auto">
          A competitive-programming judge with IOI-style subtask scoring, an in-browser editor,
          and a live leaderboard.
        </p>
        <div className="flex justify-center gap-3">
          <LinkButton href="/problems" variant="primary">
            Browse problems
          </LinkButton>
          <LinkButton href="/leaderboard" variant="outline">
            Leaderboard
          </LinkButton>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 pb-24">
        {[
          ["Subtask scoring", "IOI strict or partial. 100 points per problem, public samples included."],
          ["Real sandbox", "Judge0-backed C++/Python with per-testcase verdicts and limits."],
          ["Contests", "Live or virtual windows, hidden problems, gradient scoreboards."],
        ].map(([t, d]) => (
          <div key={t} className="surface p-5">
            <div className="h-8 w-8 bg-[rgb(var(--accent-2))] border-2 border-black mb-3" />
            <h3 className="font-pixel text-xs text-[rgb(var(--accent))]">{t}</h3>
            <p className="text-sm text-[rgb(var(--fg-muted))] mt-2">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
