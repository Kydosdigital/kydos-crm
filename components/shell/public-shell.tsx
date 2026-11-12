import type { ReactNode } from "react";
import { KydosMark } from "./logo";

/**
 * Shells for pages seen without a login. They always render in the light theme
 * (data-theme="light") so clients get one consistent, print-like look.
 */

/** Split-screen frame for sign in, request access and set password. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-side-bg p-12 text-side-ink lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(212,242,90,0.22),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-52 -left-32 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(40,160,125,0.30),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <div className="relative flex items-center gap-2.5">
          <KydosMark size={32} />
          <span className="text-[17px] font-semibold tracking-tight">Kydos<span className="ml-1.5 font-normal opacity-60">CRM</span></span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-[44px] leading-[1.08] tracking-tight">Every lead, conversation and invoice in one <em className="text-spark">calm</em> place.</p>
          <ul className="mt-8 flex flex-col gap-3 text-[14px] text-side-muted">
            {["One inbox for email, SMS, WhatsApp, Messenger and Instagram", "Follow-ups that run themselves, with you in control", "Proposals, invoices and retainers your clients can act on in a click"].map((t) => (
              <li key={t} className="flex items-start gap-3"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-spark" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-side-muted">Kydos Digital</p>
      </aside>
      <main className="flex flex-col items-center justify-center px-6 py-12">
        <div className="animate-rise w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <KydosMark size={30} />
            <span className="text-base font-semibold tracking-tight">Kydos<span className="ml-1.5 font-normal text-muted">CRM</span></span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Heading block used at the top of auth and client pages. */
export function PublicHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[34px] leading-[1.1] tracking-tight text-ink">{title}</h1>
      {children && <p className="mt-2 text-[14px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/** Calm paper ground for client-facing pages: forms, proposals, calendar approvals, payment results. */
export function ClientShell({ children, width = "md", footer, center }: { children: ReactNode; width?: "sm" | "md" | "lg"; footer?: ReactNode; center?: boolean }) {
  return (
    <div data-theme="light" className="relative flex min-h-screen flex-col bg-canvas text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(to_bottom,rgba(14,90,72,0.07),transparent)]" />
      <main className={`relative mx-auto flex w-full flex-1 flex-col px-4 py-10 sm:py-14 ${width === "sm" ? "max-w-md" : width === "lg" ? "max-w-3xl" : "max-w-xl"} ${center ? "justify-center" : ""}`}>
        <div className="animate-rise">{children}</div>
      </main>
      <footer className="relative px-4 pb-8 text-center text-xs text-muted">{footer}</footer>
    </div>
  );
}

/** Centred icon + message card for one-line outcomes (payment received, unsubscribed, invalid link). */
export function ResultCard({ icon, tone = "success", title, children }: { icon: ReactNode; tone?: "success" | "neutral" | "danger"; title: string; children?: ReactNode }) {
  const ring = tone === "success" ? "bg-success-bg text-success-ink" : tone === "danger" ? "bg-danger-bg text-danger-ink" : "bg-neutral-bg text-neutral-ink";
  return (
    <div className="card px-8 py-12 text-center shadow-md">
      <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${ring} [&_svg]:h-7 [&_svg]:w-7`}>{icon}</div>
      <h1 className="font-display text-[30px] leading-tight tracking-tight text-ink">{title}</h1>
      {children && <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
