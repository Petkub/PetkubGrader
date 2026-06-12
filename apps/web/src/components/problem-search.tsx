"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ProblemSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep input synced if the URL q changes externally (e.g. clear)
  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("q")]);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set("q", next.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
  }

  return (
    <div className="relative flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search problems…"
        className="w-full surface px-3 py-2 text-sm placeholder:text-[rgb(var(--fg-dim))] ring-cyan bg-[rgb(var(--surface))]"
      />
    </div>
  );
}
