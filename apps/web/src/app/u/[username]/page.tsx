import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/guard";
import { getProfile } from "@/lib/api";
import { StatCard, SolvedRing, LinkButton, ScoreChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const me = await requireApproved();
  const { username } = await params;
  const profile = await getProfile(username).catch(() => null);
  if (!profile) notFound();
  const isMe = me.username === profile.username;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      {/* gradient hero */}
      <div className="rounded-2xl bg-gradient-hero p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="flex items-center gap-6">
          <SolvedRing solved={profile.solved_count} total={Math.max(profile.solved_count, profile.solved_count)} />
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">{profile.name}</h1>
            <p className="font-mono text-white/80">@{profile.username}</p>
            {profile.school && <p className="text-sm text-white/70 mt-1">{profile.school}</p>}
          </div>
          {isMe && (
            <LinkButton href="/settings" variant="outline" className="!border-white/40 !text-white hover:!bg-white/10">
              Edit
            </LinkButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total score" value={profile.total_score} accent />
        <StatCard label="Global rank" value={`#${profile.rank}`} />
        <StatCard label="Solved" value={profile.solved_count} />
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--fg-dim))]">
          Solved problems
        </h2>
        {profile.solved.length === 0 ? (
          <p className="text-[rgb(var(--fg-muted))] text-sm">No fully-solved problems yet.</p>
        ) : (
          <div className="surface rounded-xl divide-y divide-[rgb(var(--border))] overflow-hidden">
            {profile.solved.map((p) => (
              <div key={p.slug} className="px-4 py-2.5 flex items-center justify-between surface-hover transition">
                <Link href={`/problems/${p.slug}`} className="font-medium hover:text-[rgb(var(--cyan))] transition">
                  {p.title}
                </Link>
                <div className="flex items-center gap-3">
                  <ScoreChip score={100} />
                  <span className="text-xs text-[rgb(var(--fg-dim))]">
                    {p.solved_at ? new Date(p.solved_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
