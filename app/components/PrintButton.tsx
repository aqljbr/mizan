"use client";

export function PrintButton({ label }: { label: string }) {
  return <button className="primary no-print" onClick={() => window.print()}>{label}</button>;
}
