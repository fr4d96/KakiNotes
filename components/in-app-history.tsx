"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { noteInAppNavigation } from "@/lib/navigation/in-app-history";

/**
 * Counts in-app page changes for lib/navigation/in-app-history.ts. Lives in
 * the root layout, which never remounts, so moving between route groups
 * (My Stories to a public story) still counts. Renders no DOM.
 */
export function InAppHistory() {
  const pathname = usePathname();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) noteInAppNavigation();
  }, [pathname]);
  return null;
}
