import Link from "next/link";
import { requireApproved } from "@/lib/guard";
import { listContests } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ContestsPage() {
  await requireApproved();
  const contests = await listContests();

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <PageHeader title="Contests" />
      <div className="surface rounded-xl divide-y divide-[rgb(var(--border))] overflow-hidden">
        {contests.length === 0 && (
          <div className="px-4 py-10 text-center text-[rgb(var(--fg-muted))]">No contests yet.</div>
        )}
        {contests.map((c) => (
          <Link
            key={c.slug}
            href={`/contests/${c.slug}`}
            className="flex items-center justify-between px-4 py-3.5 surface-hover transition"
          >
            <div className="flex-1">
              <div className="font-medium">
                {c.title}
                {!c.is_published && <span className="ml-2 text-xs text-amber-400">draft</span>}
              </div>
              <div className="text-xs text-[rgb(var(--fg-dim))] mt-0.5 font-mono">
                {c.mode} · {c.duration_min} min · {new Date(c.start_at).toLocaleString()}
                {c.registered && " · registered"}
              </div>
            </div>
            <StatusPill status={c.status} />
          </Link>
        ))}
      </div>
    </main>
  );
}
