import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { requireUser } from "@/lib/guard";
import { getProblem, submit } from "@/lib/api";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ScoreChip, Topic } from "@/components/ui";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const me = await requireUser();

  const { slug } = await params;
  const problem = await getProblem(slug).catch(() => null);
  if (!problem) notFound();

  async function handleSubmit(payload: { language: "cpp" | "python"; source: string }) {
    "use server";
    const sub = await submit({ problem_slug: slug, ...payload });
    redirect(`/submissions/${sub.id}`);
  }

  return (
    <main className="max-w-[1500px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8">
      <article className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{problem.title}</h1>
          <ScoreChip score={problem.your_best_score} />
        </div>
        <div className="text-xs text-[rgb(var(--fg-muted))] flex flex-wrap gap-x-4 gap-y-1 font-mono">
          <span>TL {problem.time_ms}ms (Py ×3)</span>
          <span>ML {problem.memory_mb} MB</span>
          <span>{problem.scoring_mode === "ioi_strict" ? "IOI strict" : "Partial"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {problem.topics.map((t) => (
            <Topic key={t.id}>{t.name}</Topic>
          ))}
          <Link
            href={`/submissions?problem=${problem.slug}`}
            className="text-xs text-[rgb(var(--cyan))] hover:underline ml-auto"
          >
            your submissions
          </Link>
          <Link
            href={`/problems/${problem.slug}/submissions`}
            className="text-xs text-[rgb(var(--cyan))] hover:underline"
          >
            · all →
          </Link>
        </div>

        <Section title="Statement" md={problem.statement_md} />
        <Section title="Input" md={problem.input_format_md} />
        <Section title="Output" md={problem.output_format_md} />
        <Section title="Constraints" md={problem.constraints_md} />

        {problem.samples.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">
              Samples
            </h2>
            {problem.samples.map((s, i) => (
              <div key={i} className="surface rounded-xl overflow-hidden">
                <div className="text-xs text-[rgb(var(--fg-dim))] px-3 pt-2">Sample {i + 1}</div>
                <div className="grid grid-cols-2 divide-x divide-[rgb(var(--border))]">
                  <div>
                    <div className="flex items-center justify-between px-3 pt-2">
                      <span className="text-xs text-[rgb(var(--fg-muted))]">Input</span>
                      <CopyButton text={s.input} />
                    </div>
                    <pre className="text-xs p-3 overflow-x-auto whitespace-pre-wrap font-mono">{s.input}</pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between px-3 pt-2">
                      <span className="text-xs text-[rgb(var(--fg-muted))]">Output</span>
                      <CopyButton text={s.output} />
                    </div>
                    <pre className="text-xs p-3 overflow-x-auto whitespace-pre-wrap font-mono">{s.output}</pre>
                  </div>
                </div>
                {s.explanation && (
                  <div className="border-t border-[rgb(var(--border))] px-3 py-2 text-sm">
                    <span className="text-[rgb(var(--fg-dim))] text-xs">Explanation: </span>
                    {s.explanation}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </article>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        {me.status === "approved" ? (
          <div className="rounded-xl overflow-hidden glow-accent">
            <CodeEditor onSubmit={handleSubmit} />
          </div>
        ) : (
          <div className="surface rounded-xl p-6 text-center space-y-2">
            <p className="font-pixel text-sm text-amber-500">Account pending approval</p>
            <p className="text-sm text-[rgb(var(--fg-muted))]">
              You can read problems, but submitting unlocks once an admin approves your account.
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}

function Section({ title, md }: { title: string; md: string }) {
  if (!md.trim()) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">
        {title}
      </h2>
      <div className="prose-cp prose prose-invert max-w-none text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {md}
        </ReactMarkdown>
      </div>
    </section>
  );
}
