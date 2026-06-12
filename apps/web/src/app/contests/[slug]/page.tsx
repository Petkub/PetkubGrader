import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconLock } from "@/components/pixel-icons";
import { requireApproved } from "@/lib/guard";
import {
  getContest,
  registerContest,
  startContest,
  addContestProblem,
  publishContest,
  createContestProblem,
  releaseContestProblems,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ContestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const me = await requireApproved();
  const { slug } = await params;
  const c = await getContest(slug).catch(() => null);
  if (!c) notFound();
  const isSetter = me.role === "admin" || me.role === "setter";

  async function doRegister() {
    "use server";
    await requireApproved();
    await registerContest(slug);
    revalidatePath(`/contests/${slug}`);
  }
  async function doStart() {
    "use server";
    await requireApproved();
    await startContest(slug);
    revalidatePath(`/contests/${slug}`);
  }
  async function doAddProblem(formData: FormData) {
    "use server";
    await requireApproved();
    await addContestProblem(
      slug,
      String(formData.get("problem_slug") ?? ""),
      String(formData.get("alias") ?? ""),
    );
    revalidatePath(`/contests/${slug}`);
  }
  async function doPublish() {
    "use server";
    await requireApproved();
    await publishContest(slug);
    revalidatePath(`/contests/${slug}`);
  }
  async function doNewProblem(formData: FormData) {
    "use server";
    await requireApproved();
    const { problem_slug } = await createContestProblem(
      slug,
      String(formData.get("title") ?? ""),
      String(formData.get("alias") ?? ""),
    );
    redirect(`/manage/${problem_slug}`);
  }
  async function doRelease() {
    "use server";
    await requireApproved();
    await releaseContestProblems(slug);
    revalidatePath(`/contests/${slug}`);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {c.mode} · {c.duration_min} min · starts {new Date(c.start_at).toLocaleString()} ·{" "}
            <span className="capitalize">{c.status}</span>
            {!c.is_published && <span className="ml-2 text-amber-600">(draft)</span>}
          </p>
        </div>
        <Link href={`/contests/${slug}/scoreboard`} className="text-sm underline">
          Scoreboard
        </Link>
      </div>

      {c.description_md && (
        <div className="prose prose-zinc dark:prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.description_md}</ReactMarkdown>
        </div>
      )}

      {/* Join / start controls */}
      <div className="flex items-center gap-3">
        {!c.registered && (
          <form action={doRegister}>
            <button className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900">
              Register
            </button>
          </form>
        )}
        {c.registered && c.mode === "virtual" && !c.started_at && (
          <form action={doStart}>
            <button className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm">
              Start now ({c.duration_min} min)
            </button>
          </form>
        )}
        {c.registered && (
          <span className="text-sm text-zinc-500">
            {c.can_access_problems
              ? "Window open — go solve!"
              : c.status === "ended"
              ? "Window closed."
              : c.mode === "live"
              ? "Waiting for start time."
              : "Not started yet."}
          </span>
        )}
      </div>

      {/* Problems */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Problems</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
          {c.problems.length === 0 && <li className="px-4 py-4 text-zinc-500 text-sm">No problems.</li>}
          {c.problems.map((p) => (
            <li key={p.alias} className="px-4 py-3 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <span className="font-mono text-zinc-500 w-6">{p.alias}</span>
                {p.slug ? (
                  <Link href={`/problems/${p.slug}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                ) : (
                  <span className="text-[rgb(var(--fg-dim))] inline-flex items-center gap-2">
                    <IconLock /> locked until your window opens
                  </span>
                )}
              </span>
              {p.your_best_score !== null && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                  {p.your_best_score}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Setter controls */}
      {isSetter && (
        <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Manage (setter)
          </h2>
          <div className="text-xs text-zinc-500">Create a new hidden problem for this contest:</div>
          <form action={doNewProblem} className="flex gap-2 items-end">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">New problem title</span>
              <input name="title" required className="block rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Alias</span>
              <input name="alias" required maxLength={8} placeholder="A" className="block w-16 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent text-sm font-mono" />
            </label>
            <button className="rounded-md bg-zinc-900 text-zinc-50 px-3 py-1.5 text-sm dark:bg-zinc-50 dark:text-zinc-900">
              New problem →
            </button>
          </form>

          <div className="text-xs text-zinc-500 pt-2">Or attach an existing problem by slug:</div>
          <form action={doAddProblem} className="flex gap-2 items-end">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Problem slug</span>
              <input name="problem_slug" required className="block rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent text-sm font-mono" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Alias</span>
              <input name="alias" required maxLength={8} placeholder="B" className="block w-16 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent text-sm font-mono" />
            </label>
            <button className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
              Attach
            </button>
          </form>

          <div className="flex items-center gap-3 pt-2">
            {!c.is_published && (
              <form action={doPublish}>
                <button className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm">
                  Publish contest
                </button>
              </form>
            )}
            {c.can_release ? (
              <form action={doRelease}>
                <button className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm">
                  Release problems to public
                </button>
              </form>
            ) : (
              <span className="text-xs text-zinc-400">
                Problems can be released to the public once the contest ends.
              </span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
