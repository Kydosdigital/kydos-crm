"use client";

import { useEffect } from "react";

/**
 * Asks "are you sure?" before any destructive button runs. A button counts as destructive when it has the
 * btn-danger class or a data-confirm attribute (whose value is used as the message). Submit behaviour is unchanged otherwise.
 */
export function ConfirmHost() {
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const el = e.submitter as HTMLElement | null;
      if (!el) return;
      const custom = el.getAttribute("data-confirm");
      if (custom === null && !el.classList.contains("btn-danger")) return;
      const label = (el.textContent ?? "").trim().toLowerCase() || "do this";
      if (!window.confirm(custom || `Are you sure you want to ${label}? This cannot be undone.`)) e.preventDefault();
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  return null;
}
