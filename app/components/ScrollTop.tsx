"use client";

import { useEffect } from "react";

// Opening a case file (e.g. after pressing Start at the bottom of the home form) starts at the top of the page.
// It runs once per engagement, not on the live refreshes while the consultant works.
export function ScrollTop({ id }: { id: string }) {
  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  return null;
}
