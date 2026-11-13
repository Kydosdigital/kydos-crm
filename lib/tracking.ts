import { createHmac, timingSafeEqual } from "crypto";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const sig = (m: string, u: string) => createHmac("sha256", process.env.CRON_SECRET!).update(`${m}|${u}`).digest("hex").slice(0, 24);

const openSig = (m: string) => createHmac("sha256", process.env.CRON_SECRET!).update(`open|${m}`).digest("hex").slice(0, 24);

export function verifyOpen(m: string, s: string) {
  const a = Buffer.from(openSig(m)), b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyClick(m: string, u: string, s: string) {
  const a = Buffer.from(sig(m, u)), b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rewrites http(s) links to signed click-tracking redirects (skipping unsubscribe) and appends an open pixel. */
export function trackHtml(html: string, messageId: string) {
  const out = html.replace(/href="(https?:\/\/[^"]+)"/g, (full, url: string) => {
    if (url.includes("/u/")) return full;
    return `href="${appUrl()}/api/t/c?m=${messageId}&u=${encodeURIComponent(url)}&s=${sig(messageId, url)}"`;
  });
  return `${out}<img src="${appUrl()}/api/t/o?m=${messageId}&s=${openSig(messageId)}" width="1" height="1" alt="" style="display:none">`;
}

/** Turns bare URLs in plain text into anchors so they can be click tracked. */
export function linkify(text: string) {
  return text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
}
