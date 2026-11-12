export type Brand = {
  name: string;
  brand_color?: string | null;
  logo_url?: string | null;
  email_signature?: string | null;
  business_address?: string | null;
  website_url?: string | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colour = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#1f3a5f");

/** Inline markup on already-escaped text: **bold**, *italic*, bare URLs become links. */
function inline(s: string) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#1f3a5f">$2</a>');
}

/**
 * Turns plain text into branded HTML email content.
 * Supported: blank line = new paragraph, "## Heading", "- bullet", **bold**, *italic*, bare links,
 * and buttons written as: [button: Book a call | https://cal.com/...]
 * All text is escaped first, so merge values from forms can never inject HTML.
 */
export function bodyToHtml(text: string, brand: string) {
  const blocks = text.replace(/\r/g, "").trim().split(/\n{2,}/);
  return blocks.map((raw) => {
    const b = raw.trim();
    const btn = b.match(/^\[button:\s*([^|\]]+)\|\s*(https?:\/\/[^\]\s]+)\s*\]$/i);
    if (btn) {
      return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td style="border-radius:6px;background:${brand}"><a href="${esc(btn[2])}" style="display:inline-block;padding:13px 26px;font-weight:600;font-size:16px;color:#ffffff;text-decoration:none;border-radius:6px">${esc(btn[1].trim())}</a></td></tr></table>`;
    }
    if (/^## /.test(b)) return `<h2 style="margin:24px 0 8px;font-size:20px;line-height:1.3;color:#111827">${inline(esc(b.slice(3)))}</h2>`;
    if (b.split("\n").every((l) => /^\s*[-•] /.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:22px">${b.split("\n").map((l) => `<li style="margin:4px 0">${inline(esc(l.replace(/^\s*[-•] /, "")))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px">${inline(esc(b)).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

/** Full branded email: coloured header with logo or name, white card, signature, compliance footer. */
export function brandEmail(b: Brand, bodyText: string, opts: { unsubscribeUrl?: string; preheader?: string } = {}) {
  const c = colour(b.brand_color);
  const header = b.logo_url
    ? `<img src="${esc(b.logo_url)}" alt="${esc(b.name)}" height="40" style="display:block;height:40px;max-width:220px;border:0">`
    : `<span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px">${esc(b.name)}</span>`;
  const sig = b.email_signature ? `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#374151">${bodyToHtml(b.email_signature, c)}</div>` : "";
  const pre = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>` : "";
  const site = b.website_url ? ` · <a href="${esc(b.website_url)}" style="color:#6b7280">${esc(b.website_url.replace(/^https?:\/\//, ""))}</a>` : "";
  const unsub = opts.unsubscribeUrl ? `<br><a href="${opts.unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a>` : "";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${pre}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
<tr><td style="background:${c};padding:20px 28px;border-radius:10px 10px 0 0">${header}</td></tr>
<tr><td style="background:#ffffff;padding:32px 28px;font-size:16px;line-height:1.6;color:#1f2937;border-radius:0 0 10px 10px">${bodyToHtml(bodyText, c)}${sig}</td></tr>
<tr><td style="padding:18px 8px;text-align:center;font-size:12px;line-height:1.6;color:#6b7280">${esc(b.name)}${b.business_address ? `, ${esc(b.business_address)}` : ""}${site}${unsub}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Plain-text twin of the email (better deliverability, and for clients that block HTML). */
export function brandText(b: Brand, bodyText: string, unsubscribeUrl?: string) {
  return `${bodyText.replace(/\[button:\s*([^|\]]+)\|\s*(https?:\/\/[^\]\s]+)\s*\]/gi, "$1: $2")}${b.email_signature ? `\n\n${b.email_signature}` : ""}\n\n--\n${b.name}${b.business_address ? `, ${b.business_address}` : ""}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}`;
}
