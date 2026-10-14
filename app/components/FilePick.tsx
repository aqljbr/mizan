"use client";

import { useState } from "react";

// A file picker that looks like the rest of the app and shows what was chosen.
export function FilePick({ name, label, none }: { name: string; label: string; none: string }) {
  const [files, setFiles] = useState<string[]>([]);
  return (
    <div className="file-pick">
      <label className="ghost" htmlFor={`fp-${name}`} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById(`fp-${name}`)?.click(); } }}>{label}</label>
      <input id={`fp-${name}`} name={name} type="file" multiple className="file-in" accept=".pdf,.docx,.txt,.md,.csv,.tsv,.xlsx"
        onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => `${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`))} />
      <span className="names" aria-live="polite">{files.length ? files.join(", ") : none}</span>
    </div>
  );
}
