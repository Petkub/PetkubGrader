import { redirect } from "next/navigation";
import { requireApprovedNoHandleGate } from "@/lib/guard";
import { updateMe } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const me = await requireApprovedNoHandleGate();
  const { err, ok } = await searchParams;
  const needsHandle = !me.username;

  async function save(formData: FormData) {
    "use server";
    await requireApprovedNoHandleGate();
    try {
      const updated = await updateMe({
        name: String(formData.get("name") ?? ""),
        username: String(formData.get("username") ?? ""),
        school: String(formData.get("school") ?? ""),
      });
      redirect(`/u/${updated.username}`);
    } catch (e) {
      // redirect() throws a control-flow signal — rethrow it untouched.
      if (e && typeof e === "object" && "digest" in e) throw e;
      const m = e instanceof Error ? e.message : "save failed";
      redirect(`/settings?err=${encodeURIComponent(m)}`);
    }
  }

  return (
    <main className="max-w-md mx-auto px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {needsHandle && (
        <p className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">
          Pick a username to finish setting up your account.
        </p>
      )}
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
        <L label="Display name">
          <input name="name" defaultValue={me.name} required className={inp} />
        </L>
        <L label="Username (handle) — a-z, 0-9, _ or -, 3–30 chars">
          <input
            name="username"
            defaultValue={me.username ?? ""}
            required
            pattern="[a-zA-Z0-9_\-]{3,30}"
            placeholder="your_handle"
            className={`${inp} font-mono`}
          />
        </L>
        <L label="School (optional)">
          <input name="school" defaultValue={me.school ?? ""} className={inp} />
        </L>
        <button className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900">
          Save
        </button>
      </form>
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
