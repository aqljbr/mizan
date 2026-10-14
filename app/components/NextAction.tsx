"use client";

import { useTransition } from "react";
import { retryFrame, startAnalysis } from "@/app/actions";
import { useT } from "./LangProvider";

export function NextAction({ id, action, label }: { id: string; action: "retry-frame" | "analyse"; label: string }) {
  const { t } = useT();
  const [busy, start] = useTransition();
  return (
    <button className="go" disabled={busy} onClick={() => start(() => (action === "analyse" ? startAnalysis(id) : retryFrame(id)))}>
      {busy ? t("next.starting") : label}
    </button>
  );
}
