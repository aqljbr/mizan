"use client";

// Moves the reader to what the next step is about: switches to the right tab, then scrolls and focuses.
const TAB_OF: Record<string, string> = { und: "overview", progress: "overview", data: "data", report: "answer", scanH: "analysis" };

export function NextGo({ target, label }: { target: string; label: string }) {
  return (
    <button
      className="go"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("ac:tab", { detail: TAB_OF[target] ?? "overview" }));
        setTimeout(() => {
          const h = document.getElementById(target);
          if (!h) return;
          h.scrollIntoView({ behavior: "smooth", block: "start" });
          h.focus({ preventScroll: true });
        }, 60);
      }}
    >
      {label}
    </button>
  );
}
