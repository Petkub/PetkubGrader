"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Lang = "cpp" | "python";

const TEMPLATES: Record<Lang, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // your code here
    return 0;
}
`,
  python: `import sys
input = sys.stdin.readline

def solve():
    # your code here
    pass

solve()
`,
};

export function CodeEditor({
  onSubmit,
}: {
  onSubmit: (payload: { language: Lang; source: string }) => Promise<void> | void;
}) {
  const [language, setLanguage] = useState<Lang>("cpp");
  const [source, setSource] = useState<string>(TEMPLATES.cpp);
  const [submitting, setSubmitting] = useState(false);

  function switchLang(next: Lang) {
    if (source === TEMPLATES[language]) {
      // user hasn't typed — swap template
      setSource(TEMPLATES[next]);
    }
    setLanguage(next);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({ language, source });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <select
          value={language}
          onChange={(e) => switchLang(e.target.value as Lang)}
          className="text-sm bg-transparent border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1"
        >
          <option value="cpp">C++ (g++ 12)</option>
          <option value="python">Python 3.11</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="text-sm rounded-md bg-zinc-900 text-zinc-50 px-4 py-1.5 dark:bg-zinc-50 dark:text-zinc-900 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
      <Monaco
        height="60vh"
        language={language === "cpp" ? "cpp" : "python"}
        theme="vs-dark"
        value={source}
        onChange={(v) => setSource(v ?? "")}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}
