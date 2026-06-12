"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Sample = { input: string; output: string; explanation: string };

export function SampleEditor({
  slug,
  initial,
}: {
  slug: string;
  initial: { input: string; output: string; explanation: string | null }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Sample[]>(
    initial.length
      ? initial.map((s) => ({ input: s.input, output: s.output, explanation: s.explanation ?? "" }))
      : [{ input: "", output: "", explanation: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function update(i: number, field: keyof Sample, value: string) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  }
  function add() {
    setRows((r) => [...r, { input: "", output: "", explanation: "" }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, j) => j !== i));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    // Drop fully-empty rows.
    const samples = rows.filter((r) => r.input.trim() !== "" || r.output.trim() !== "");
    try {
      const res = await fetch(`/api/manage/problems/${slug}/samples`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOk(false);
        setMsg(data.detail ?? `Failed (${res.status})`);
      } else {
        setOk(true);
        setMsg(`Saved ${data.samples?.length ?? 0} sample(s).`);
        router.refresh();
      }
    } catch (e) {
      setOk(false);
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Sample {i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs text-rose-600 hover:underline"
            >
              remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Input</span>
              <textarea
                value={row.input}
                onChange={(e) => update(i, "input", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Output</span>
              <textarea
                value={row.output}
                onChange={(e) => update(i, "output", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent font-mono text-xs"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Explanation (optional)</span>
            <textarea
              value={row.explanation}
              onChange={(e) => update(i, "explanation", e.target.value)}
              rows={2}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 bg-transparent text-xs"
            />
          </label>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5"
        >
          + Add sample
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="text-sm rounded-md bg-zinc-900 text-zinc-50 px-4 py-1.5 dark:bg-zinc-50 dark:text-zinc-900 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save samples"}
        </button>
        {msg && <span className={`text-sm ${ok ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>}
      </div>
    </div>
  );
}
