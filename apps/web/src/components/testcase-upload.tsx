"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TestcaseUpload({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/manage/problems/${slug}/testcases`, {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOk(false);
        setMsg(data.detail ?? `Upload failed (${res.status})`);
      } else {
        setOk(true);
        setMsg(`Uploaded: ${data.subtasks} subtasks, ${data.testcases} testcases.`);
        router.refresh();
      }
    } catch (err) {
      setOk(false);
      setMsg(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input
        type="file"
        name="file"
        accept=".zip"
        required
        className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:text-zinc-50 file:px-3 file:py-1.5 dark:file:bg-zinc-50 dark:file:text-zinc-900"
      />
      <button
        disabled={busy}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload package"}
      </button>
      {msg && (
        <p className={`text-sm ${ok ? "text-emerald-600" : "text-rose-600"}`}>{msg}</p>
      )}
    </form>
  );
}
