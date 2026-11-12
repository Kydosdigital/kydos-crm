"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the layout once on mount so sidebar counts reflect a server-side change made during render. */
export function RefreshOnce({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => { if (when) router.refresh(); }, [when, router]);
  return null;
}
