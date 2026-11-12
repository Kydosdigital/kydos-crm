"use client";

import { Moon, Sun } from "lucide-react";

/** Flips data-theme on <html> and remembers the choice. The root layout applies it before first paint. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-side-muted transition-colors hover:bg-side-hover hover:text-side-ink"
      onClick={() => {
        const root = document.documentElement;
        const next = root.dataset.theme === "dark" ? "light" : "dark";
        root.dataset.theme = next;
        try { localStorage.setItem("kydos-theme", next); } catch { /* storage unavailable */ }
      }}
    >
      <Sun className="hidden h-4 w-4 [[data-theme=dark]_&]:block" aria-hidden />
      <Moon className="h-4 w-4 [[data-theme=dark]_&]:hidden" aria-hidden />
    </button>
  );
}
