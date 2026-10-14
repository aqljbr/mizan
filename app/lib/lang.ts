import { cookies } from "next/headers";
import type { Lang } from "./i18n";

/** Interface language for this request, from the "lang" cookie. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return v === "ar" ? "ar" : "en";
}
