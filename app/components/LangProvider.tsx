"use client";

import { createContext, useContext } from "react";
import { t as translate, locale, type Key, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useT() {
  const lang = useContext(Ctx);
  return {
    lang,
    loc: locale(lang),
    t: (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
  };
}
