import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, AtSign, Camera, CheckCircle2, Info, Mail, MessageCircle, MessageSquareText, MessagesSquare, Phone, XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn";
import { humanise, initials, statusTone, type Tone } from "./format";

export { cn } from "./cn";
export * from "./format";

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

/** Standard page container. Every app page starts with this so titles line up across screens. */
export function Page({ children, width = "default", className }: { children: ReactNode; width?: "default" | "narrow" | "full"; className?: string }) {
  // "narrow" keeps the same left edge as other pages and only limits the line length.
  return (
    <div className={cn("animate-rise mx-auto w-full px-8 pb-16 pt-7", width === "full" ? "max-w-none" : "max-w-[1180px]", className)}>
      {width === "narrow" ? <div className="max-w-3xl">{children}</div> : children}
    </div>
  );
}

export function PageHeader({ title, description, actions, back, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold leading-tight text-ink">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled block inside a page. Use `card` to wrap the children in a padded card. */
export function Section({ title, description, actions, children, className, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cn("card", pad && "p-5", className)}>{children}</div>;
}

/** Card heading row used inside padded cards. */
export function CardTitle({ children, icon: Icon, aside }: { children: ReactNode; icon?: LucideIcon; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {Icon && <Icon className="h-4 w-4 text-faint" aria-hidden />}
        {children}
      </h3>
      {aside}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

const ALERT_ICON: Record<string, LucideIcon> = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info, neutral: Info };

export function Alert({ tone = "info", children, className }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode; className?: string }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("alert mb-4", tone !== "neutral" && `alert-${tone}`, className)}>
      <Icon aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return <span className={cn("badge", tone !== "neutral" && `badge-${tone}`, dot && "badge-dot", className)}>{children}</span>;
}

/** Badge for a raw status value from the database, with a consistent colour per status. */
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: ReactNode }) {
  if (!status && !label) return null;
  return <Badge tone={statusTone(status)} dot>{label ?? humanise(status)}</Badge>;
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-sunken text-muted shadow-xs">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Stat({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "brand" | "danger" | "warning" }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tone === "danger" ? "bg-danger-bg text-danger-ink" : tone === "warning" ? "bg-warning-bg text-warning-ink" : tone === "brand" ? "bg-brand-soft text-brand-soft-ink" : "bg-subtle text-muted")}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="tabular mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

const AVATAR_TINTS = [
  "bg-brand-soft text-brand-soft-ink", "bg-info-bg text-info-ink", "bg-violet-bg text-violet-ink",
  "bg-warning-bg text-warning-ink", "bg-danger-bg text-danger-ink", "bg-success-bg text-success-ink",
];

/** Initials avatar with a stable tint per name. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", AVATAR_TINTS[h % AVATAR_TINTS.length], size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-[11px]", className)}>
      {initials(name)}
    </span>
  );
}

/** Horizontal bar for simple in-table charts. */
export function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const w = max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return <div className={cn("meter w-full", className)} role="presentation"><span style={{ width: `${w}%` }} /></div>;
}

const CHANNELS: Record<string, { icon: LucideIcon; label: string; cls: string }> = {
  email: { icon: Mail, label: "Email", cls: "bg-info-bg text-info-ink" },
  outlook: { icon: Mail, label: "Outlook", cls: "bg-info-bg text-info-ink" },
  sms: { icon: MessageSquareText, label: "SMS", cls: "bg-violet-bg text-violet-ink" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", cls: "bg-success-bg text-success-ink" },
  messenger: { icon: MessagesSquare, label: "Messenger", cls: "bg-info-bg text-info-ink" },
  instagram: { icon: Camera, label: "Instagram", cls: "bg-danger-bg text-danger-ink" },
  call: { icon: Phone, label: "Call", cls: "bg-warning-bg text-warning-ink" },
};

export function channelLabel(channel: string) {
  return CHANNELS[channel]?.label ?? humanise(channel);
}

/** Small tinted square with the channel's icon. Pass `label` to show the name next to it. */
export function ChannelIcon({ channel, label, size = "md" }: { channel: string; label?: boolean; size?: "sm" | "md" }) {
  const c = CHANNELS[channel] ?? { icon: AtSign, label: humanise(channel), cls: "bg-neutral-bg text-neutral-ink" };
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span title={c.label} className={cn("inline-flex shrink-0 items-center justify-center rounded-md", c.cls, size === "sm" ? "h-5 w-5" : "h-6 w-6")}>
        <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
        {!label && <span className="sr-only">{c.label}</span>}
      </span>
      {label && <span className="text-[13px] font-medium text-ink-2">{c.label}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

/** Label + control + optional hint. The control is passed as children so its `name` stays in the page file. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint mt-1 block">{hint}</span>}
    </label>
  );
}

/** Segmented control made of links, for range and filter switches driven by the URL. */
export function Segmented({ items, label }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="segmented">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}

/** Table inside a card with horizontal overflow handled. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card overflow-x-auto", className)}>{children}</div>;
}
