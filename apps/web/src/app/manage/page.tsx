import Link from "next/link";
import { requireSetter } from "@/lib/guard";
import { listProblems } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  await requireSetter();
  const problems = await listProblems({ includeDrafts: true });

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Manage problems</h1>
        <div className="flex items-center gap-3">
          <Link href="/manage/contests" className="text-sm hover:underline">
            Contests
          </Link>
          <Link
            href="/manage/new"
            className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900"
          >
            New problem
          </Link>
        </div>
      </header>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
        {problems.length === 0 && <li className="px-4 py-6 text-zinc-500">No problems yet.</li>}
        {problems.map((p) => (
          <li key={p.id} className="px-4 py-3 flex items-center justify-between">
            <Link href={`/manage/${p.slug}`} className="flex-1">
              <span className="font-medium">{p.title}</span>
              <span className="ml-2 text-xs text-zinc-500 font-mono">{p.slug}</span>
            </Link>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                p.is_public
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {p.is_public ? "published" : "draft"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
