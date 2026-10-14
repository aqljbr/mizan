import type { Metadata } from "next";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";
import { LangProvider } from "@/components/LangProvider";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { MizanMark, Wordmark } from "@/components/Logo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mizan · Evidence-weighed decisions",
  description: "Mizan is an AI consulting team: it frames your problem, analyses your data, tests options with simulated people, has an independent checker attack the result, and keeps a record of every step.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  const live = db().prepare("SELECT engagement_id FROM jobs WHERE status = 'running' ORDER BY id DESC").all() as { engagement_id: string }[];
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Naskh+Arabic:wght@500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap"
        />
      </head>
      <body>
        <LangProvider lang={lang}>
          <a className="skip" href="#main">{t(lang, "skip")}</a>
          <header className="bar no-print">
            <div className="bar-in">
              <Link href="/" className="brand" aria-label="Mizan"><MizanMark size={36} /><Wordmark lang={lang} /></Link>
              <NavLinks live={live.map((l) => l.engagement_id)} demo={process.env.AICONSULT_DEMO === "1"} />
            </div>
          </header>
          <main id="main">{children}</main>
        </LangProvider>
      </body>
    </html>
  );
}
