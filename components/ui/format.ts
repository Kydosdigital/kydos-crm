// Presentation-only formatting helpers shared by pages. UK locale and London time throughout.

type Person = { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null | undefined;

/** "Ada Lovelace", falling back to email, phone, then the given fallback. */
export function personName(p: Person, fallback = "Unknown") {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || p?.phone || fallback;
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s@.+]/gu, "").trim().split(/[\s@.]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[1][0] : "")).toUpperCase();
}

const TZ = "Europe/London";
export const dateTime = (d: string | Date) => new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateOnly = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
export const timeOnly = (d: string | Date) => new Date(d).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** "awaiting_approval" -> "Awaiting approval" */
export function humanise(s: string | null | undefined) {
  const t = String(s ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand" | "violet" | "outline";

const TONES: Record<string, Tone> = {
  // money
  paid: "success", sent: "info", draft: "neutral", void: "neutral", overdue: "danger",
  // retainers
  active: "success", pending: "warning", past_due: "danger", cancelled: "neutral",
  // proposals
  viewed: "violet", accepted: "success", declined: "danger",
  // content
  awaiting_approval: "warning", approved: "success", changes_requested: "danger", published: "brand",
  // messages and calls
  delivered: "success", read: "success", opened: "violet", clicked: "violet", received: "info", queued: "neutral", failed: "danger", bounced: "danger", undelivered: "danger",
  completed: "success", "no-answer": "warning", busy: "warning", missed: "warning",
  // bookings
  attended: "success", no_show: "danger", booked: "info", confirmed: "info",
  // integrations, scheduled sends, drafts
  connected: "success", needs_setup: "neutral", error: "danger", scheduled: "info", rejected: "danger", done: "success", stopped: "neutral",
};

/** Maps a status string from the database to a badge tone. Unknown statuses are neutral. */
export function statusTone(status: string | null | undefined): Tone {
  return TONES[String(status ?? "").toLowerCase()] ?? "neutral";
}
