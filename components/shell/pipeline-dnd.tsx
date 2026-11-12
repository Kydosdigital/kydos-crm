"use client";

import { useEffect, useRef } from "react";

/**
 * Drag and drop for the pipeline board. Cards carry data-opp, columns carry data-stage. Dropping a card on a column
 * sets that card's existing stage menu and submits its existing Move form, so the server action is unchanged.
 */
export function PipelineDnd({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let dragging: HTMLElement | null = null;
    const col = (t: EventTarget | null) => (t as HTMLElement | null)?.closest<HTMLElement>("[data-stage]") ?? null;
    const start = (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-opp]");
      if (!card) return;
      dragging = card;
      card.classList.add("opacity-50");
      e.dataTransfer?.setData("text/plain", card.dataset.opp ?? "");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const over = (e: DragEvent) => {
      const c = col(e.target);
      if (!c || !dragging) return;
      e.preventDefault();
      root.querySelectorAll("[data-stage]").forEach((x) => x.classList.remove("ring-2", "ring-brand"));
      c.classList.add("ring-2", "ring-brand");
    };
    const end = () => {
      dragging?.classList.remove("opacity-50");
      dragging = null;
      root.querySelectorAll("[data-stage]").forEach((x) => x.classList.remove("ring-2", "ring-brand"));
    };
    const drop = (e: DragEvent) => {
      const c = col(e.target);
      const card = dragging;
      end();
      if (!c || !card) return;
      e.preventDefault();
      const form = card.querySelector("form");
      const select = form?.querySelector<HTMLSelectElement>("select[name=stage_id]");
      if (!form || !select || select.value === c.dataset.stage) return;
      select.value = c.dataset.stage ?? select.value;
      form.requestSubmit();
    };
    root.addEventListener("dragstart", start);
    root.addEventListener("dragover", over);
    root.addEventListener("dragend", end);
    root.addEventListener("drop", drop);
    return () => {
      root.removeEventListener("dragstart", start);
      root.removeEventListener("dragover", over);
      root.removeEventListener("dragend", end);
      root.removeEventListener("drop", drop);
    };
  }, []);
  return <div ref={ref} className="-mx-8 flex gap-3 overflow-x-auto px-8 pb-4">{children}</div>;
}
