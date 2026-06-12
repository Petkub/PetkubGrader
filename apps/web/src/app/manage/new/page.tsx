import { redirect } from "next/navigation";
import { requireSetter } from "@/lib/guard";
import { createProblem } from "@/lib/api";

export default async function NewProblemPage() {
  await requireSetter();

  async function create(formData: FormData) {
    "use server";
    await requireSetter();
    const slug = String(formData.get("slug") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const scoring_mode = String(formData.get("scoring_mode") ?? "ioi_strict") as
      | "ioi_strict"
      | "partial";
    await createProblem({ slug, title, scoring_mode });
    redirect(`/manage/${slug}`);
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">New problem</h1>
      <form action={create} className="space-y-4">
        <Field label="Slug (URL id, e.g. a-plus-b)">
          <input
            name="slug"
            required
            pattern="[a-z0-9\-]+"
            placeholder="a-plus-b"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent font-mono"
          />
        </Field>
        <Field label="Title">
          <input
            name="title"
            required
            placeholder="A + B"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent"
          />
        </Field>
        <Field label="Scoring mode">
          <select
            name="scoring_mode"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent"
          >
            <option value="ioi_strict">IOI strict (subtask all-or-nothing)</option>
            <option value="partial">Partial (per-testcase proportional)</option>
          </select>
        </Field>
        <button className="rounded-md bg-zinc-900 text-zinc-50 px-4 py-2 text-sm dark:bg-zinc-50 dark:text-zinc-900">
          Create draft
        </button>
      </form>
      <p className="text-xs text-zinc-500">
        After creating, add the statement and upload a testcase package, then publish.
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
