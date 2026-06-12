import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSetter } from "@/lib/guard";
import {
  getProblem,
  listTopics,
  updateProblem,
  publishProblem,
  unpublishProblem,
} from "@/lib/api";
import { TestcaseUpload } from "@/components/testcase-upload";
import { SampleEditor } from "@/components/sample-editor";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  await requireSetter();
  const { slug } = await params;
  const { err, ok } = await searchParams;
  const [problem, topics] = await Promise.all([getProblem(slug), listTopics()]);
  const selected = new Set(problem.topics.map((t) => t.slug));

  async function save(formData: FormData) {
    "use server";
    await requireSetter();
    await updateProblem(slug, {
      title: String(formData.get("title") ?? ""),
      statement_md: String(formData.get("statement_md") ?? ""),
      input_format_md: String(formData.get("input_format_md") ?? ""),
      output_format_md: String(formData.get("output_format_md") ?? ""),
      constraints_md: String(formData.get("constraints_md") ?? ""),
      time_ms: Number(formData.get("time_ms")),
      memory_mb: Number(formData.get("memory_mb")),
      scoring_mode: String(formData.get("scoring_mode")) as "ioi_strict" | "partial",
      topic_slugs: formData.getAll("topics").map(String),
    });
    redirect(`/manage/${slug}?ok=saved`);
  }

  async function togglePublish() {
    "use server";
    await requireSetter();
    try {
      if (problem.is_public) await unpublishProblem(slug);
      else await publishProblem(slug);
    } catch (e) {
      const m = e instanceof Error ? e.message : "publish failed";
      redirect(`/manage/${slug}?err=${encodeURIComponent(m)}`);
    }
    redirect(`/manage/${slug}?ok=1`);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/manage" className="text-sm text-zinc-500 hover:underline">
            ← all problems
          </Link>
          <h1 className="text-2xl font-bold mt-1">{problem.title}</h1>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            problem.is_public
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {problem.is_public ? "published" : "draft"}
        </span>
      </div>

      {err && (
        <p className="rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
          {err}
        </p>
      )}
      {ok && (
        <p className="rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-sm">
          Saved.
        </p>
      )}

      <form action={save} className="space-y-4">
        <L label="Title">
          <input name="title" defaultValue={problem.title} className={inp} />
        </L>
        <L label="Statement (Markdown + $KaTeX$)">
          <textarea name="statement_md" defaultValue={problem.statement_md} rows={6} className={inp} />
        </L>
        <div className="grid grid-cols-2 gap-4">
          <L label="Input format">
            <textarea name="input_format_md" defaultValue={problem.input_format_md} rows={3} className={inp} />
          </L>
          <L label="Output format">
            <textarea name="output_format_md" defaultValue={problem.output_format_md} rows={3} className={inp} />
          </L>
        </div>
        <L label="Constraints">
          <textarea name="constraints_md" defaultValue={problem.constraints_md} rows={2} className={inp} />
        </L>
        <div className="grid grid-cols-3 gap-4">
          <L label="Time limit (ms)">
            <input name="time_ms" type="number" defaultValue={problem.time_ms} className={inp} />
          </L>
          <L label="Memory (MB)">
            <input name="memory_mb" type="number" defaultValue={problem.memory_mb} className={inp} />
          </L>
          <L label="Scoring">
            <select name="scoring_mode" defaultValue={problem.scoring_mode} className={inp}>
              <option value="ioi_strict">IOI strict</option>
              <option value="partial">Partial</option>
            </select>
          </L>
        </div>
        <L label="Topics">
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <label
                key={t.id}
                className="inline-flex items-center gap-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-full px-3 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  name="topics"
                  value={t.slug}
                  defaultChecked={selected.has(t.slug)}
                />
                {t.name}
              </label>
            ))}
          </div>
        </L>
        <button className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900">
          Save changes
        </button>
      </form>

      <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Testcase package
        </h2>
        <p className="text-xs text-zinc-500">
          ZIP with <code>config.yaml</code> + <code>tests/N.in</code> / <code>tests/N.out</code>.
          Re-uploading replaces all subtasks. Add public samples with a{" "}
          <code>samples:</code> list (each <code>in</code>/<code>out</code>/<code>explanation</code>) —
          shown on the problem page and graded as a 0-point sample subtask.
        </p>
        <TestcaseUpload slug={slug} />
      </section>

      <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Sample testcases
        </h2>
        <p className="text-xs text-zinc-500">
          Public worked examples shown on the problem page. Graded on each submission as a
          0-point subtask.
        </p>
        <SampleEditor slug={slug} initial={problem.samples} />
      </section>

      <section className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <form action={togglePublish}>
          <button
            className={`rounded-md px-4 py-2 text-sm ${
              problem.is_public
                ? "border border-zinc-300 dark:border-zinc-700"
                : "bg-emerald-600 text-white"
            }`}
          >
            {problem.is_public ? "Unpublish" : "Publish"}
          </button>
        </form>
        {!problem.is_public && (
          <p className="text-xs text-zinc-500 mt-2">
            Publish requires subtasks summing to 100, each with testcases.
          </p>
        )}
      </section>
    </main>
  );
}

const inp =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent text-sm";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
