"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { resetDemo, saveDemoSnapshot, setLang } from "@/app/actions";
import { useT } from "./LangProvider";

export function NavLinks({ live, demo }: { live: string[]; demo: boolean }) {
  const p = usePathname();
  const { t, lang } = useT();
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <nav className="tabs" aria-label="Main">
        <Link href="/" className="tab" aria-current={p === "/" ? "page" : undefined}>{t("nav.engagements")}</Link>
      </nav>
      <div className="bar-tools">
        {live.length > 0
          ? <Link href={`/e/${live[0]}`} className="live-dot">{lang === "ar" ? `يعمل الآن على ${live.length}` : `Working on ${live.length} now`}</Link>
          : null}
        <button className="pill-btn" lang={lang === "ar" ? "en" : "ar"} aria-label={t("nav.langLabel")}
          onClick={() => start(() => setLang(lang === "ar" ? "en" : "ar"))}>
          {t("nav.lang")}
        </button>
        {demo && (
          // Demo tools only exist in demo mode, tucked in a menu: "Reset" wipes everything.
          <details className="demo-menu demo-tool">
            <summary className="pill-btn">{lang === "ar" ? "العرض" : "Demo"}</summary>
            <div className="demo-pop">
              <button className="ghost" disabled={busy} onClick={() => start(async () => { await saveDemoSnapshot(); setSaved(true); setTimeout(() => setSaved(false), 2500); })}>
                {saved ? t("nav.snapshotDone") : t("nav.snapshot")}
              </button>
              <button className="danger" disabled={busy} onClick={() => { if (confirm(t("nav.resetConfirm"))) start(() => resetDemo()); }}>
                {busy ? t("nav.resetting") : t("nav.reset")}
              </button>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
