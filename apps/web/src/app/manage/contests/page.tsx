import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSetter } from "@/lib/guard";
import { listContests, createContest } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ManageContestsPage() {
  await requireSetter();
  const contests = await listContests();

  async function create(formData: FormData) {
    "use server";
    await requireSetter();
    const slug = String(formData.get("slug") ?? "").trim();
    await createContest({
      slug,
      title: String(formData.get("title") ?? ""),
      description_md: String(formData.get("description_md") ?? ""),
      mode: String(formData.get("mode") ?? "virtual") as "live" | "virtual",
      start_at: new Date(String(formData.get("start_at"))).toISOString(),
      duration_min: Number(formData.get("duration_min") ?? 120),
    });
    redirect(`/contests/${slug}`);
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Manage contests</h1>

      <form action={create} className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">New contest</h2>
        <L label="Slug"><input name="slug" required pattern="[a-z0-9\-]+" className={inp + " font-mono"} /></L>
        <L label="Title"><input name="title" required className={inp} /></L>
        <L label="Description (Markdown)"><textarea name="description_md" rows={3} className={inp} /></L>
        <div className="grid grid-cols-3 gap-3">
          <L label="Mode">
            <select name="mode" className={inp}>
              <option value="virtual">Virtual</option>
              <option value="live">Live</option>
            </select>
          </L>
          <L label="Start"><input name="start_at" type="datetime-local" required className={inp} /></L>
          <L label="Duration (min)"><input name="duration_min" type="number" defaultValue={120} className={inp} /></L>
        </div>
        <button className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900">
          Create draft
        </button>
        <p className="text-xs text-zinc-500">Add problems + publish on the contest page after creating.</p>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">All contests</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
          {contests.map((c) => (
            <li key={c.slug} className="px-4 py-2.5 flex items-center justify-between">
              <Link href={`/contests/${c.slug}`} className="font-medium hover:underline">{c.title}</Link>
              <span className="text-xs text-zinc-500">{c.is_published ? "published" : "draft"}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const inp = "w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent text-sm";
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
