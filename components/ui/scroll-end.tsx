"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A scrollable box that starts scrolled to the bottom, for conversation threads. Visual only. */
export function ScrollEnd({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
