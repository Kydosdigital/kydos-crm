"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * Trigger button plus a native <dialog>. Purely visual: the children (usually a server-rendered
 * <form action={serverAction}>) are passed through untouched. The dialog closes when a form inside it submits.
 */
export function Modal({ trigger, triggerClassName = "btn btn-primary", title, description, children, wide }: {
  trigger: ReactNode; triggerClassName?: string; title: string; description?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>{trigger}</button>
      <dialog
        ref={ref}
        className={cn("modal", wide && "modal-wide")}
        aria-label={title}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        onSubmit={() => ref.current?.close()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon -mr-1.5" aria-label="Close" onClick={() => ref.current?.close()}><X /></button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </dialog>
    </>
  );
}
