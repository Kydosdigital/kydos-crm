import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMessage } from "../../actions";
import { CornerUpLeft, ExternalLink, Inbox as InboxIcon, MessageSquare, Send } from "lucide-react";
import { Avatar, Badge, ChannelIcon, EmptyState, Page, PageHeader, channelLabel, dateTime, personName } from "@/components/ui";
import { ScrollEnd } from "@/components/ui/scroll-end";
import { RefreshOnce } from "@/components/ui/refresh-once";

type C = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; custom: Record<string, string> | null };
const label = (c: C) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Unknown";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string; f?: string }> }) {
  const { c: selected, f } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();

  // Opening a thread marks its inbound messages as read.
  let hadUnread = false;
  if (selected) {
    const { count } = await supabaseAdmin().from("messages").select("id", { count: "exact", head: true })
      .eq("workspace_id", ws.id).eq("contact_id", selected).eq("direction", "in").is("read_at", null);
    hadUnread = (count ?? 0) > 0;
    await supabaseAdmin().from("messages").update({ read_at: new Date().toISOString() })
      .eq("workspace_id", ws.id).eq("contact_id", selected).eq("direction", "in").is("read_at", null);
  }

  const [{ data }, { data: unreadRows }] = await Promise.all([
    db.from("messages").select("id,contact_id,channel,direction,body,created_at,contacts(id,first_name,last_name,email,phone,custom)")
      .eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(400),
    db.from("messages").select("contact_id").eq("workspace_id", ws.id).eq("direction", "in").is("read_at", null).limit(1000),
  ]);
  const unreadBy = new Map<string, number>();
  for (const r of unreadRows ?? []) unreadBy.set(r.contact_id, (unreadBy.get(r.contact_id) ?? 0) + 1);

  const seen = new Set<string>();
  const allThreads = (data ?? []).filter((m) => (seen.has(m.contact_id) ? false : (seen.add(m.contact_id), true)));
  const unreadCount = allThreads.filter((m) => unreadBy.has(m.contact_id)).length;
  const threads = f === "unread" ? allThreads.filter((m) => unreadBy.has(m.contact_id)) : allThreads;

  const active = selected ? allThreads.find((m) => m.contact_id === selected) : undefined;
  const contact = active ? (active.contacts as unknown as C) : null;
  const { data: convo } = selected && contact
    ? await db.from("messages").select("*").eq("contact_id", selected).order("created_at")
    : { data: [] as { id: string; channel: string; direction: string; subject: string | null; body: string; status: string; error: string | null; created_at: string }[] };
  const { data: conn } = await supabaseAdmin().from("mail_connections").select("account_email").eq("workspace_id", ws.id).maybeSingle();
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  return (
    <Page>
      <RefreshOnce when={hadUnread} />
      <PageHeader
        title="Inbox"
        meta={unreadCount > 0 ? <Badge tone="brand" dot>{unreadCount} unread</Badge> : undefined}
        description="Every conversation across email, SMS, WhatsApp, Messenger and Instagram. Pick one to read and reply."
      />
      {allThreads.length === 0 ? (
        <div className="card"><EmptyState icon={InboxIcon} title="No messages yet.">Conversations appear here as soon as you send or receive a message.</EmptyState></div>
      ) : (
        <div className="card grid h-[calc(100vh-14rem)] min-h-[28rem] grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-line">
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2.5">
              <Link href={q({ c: selected })} className={`badge ${f !== "unread" ? "badge-brand" : "hover:text-ink"}`}>All</Link>
              <Link href={q({ c: selected, f: "unread" })} className={`badge ${f === "unread" ? "badge-brand" : "hover:text-ink"}`}>Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {threads.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">Nothing unread. You are all caught up.</li>}
              {threads.map((m) => {
                const c = m.contacts as unknown as C;
                const n = unreadBy.get(m.contact_id) ?? 0;
                const on = m.contact_id === selected;
                return (
                  <li key={m.id}>
                    <Link href={q({ c: m.contact_id, f })} className={`relative flex items-start gap-3 px-3.5 py-3 outline-offset-[-2px] transition-colors ${on ? "bg-brand-soft" : "hover:bg-sunken"}`}>
                      {n > 0 && <span aria-hidden className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-r-full bg-brand-text" />}
                      <Avatar name={personName(c)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-[13.5px] text-ink ${n > 0 ? "font-semibold" : "font-medium"}`}>{label(c)}</span>
                          <span className="tabular shrink-0 text-[11px] text-muted">{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <ChannelIcon channel={m.channel} size="sm" />
                          <span className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[12.5px] ${n > 0 ? "text-ink-2" : "text-muted"}`}>
                            {m.direction === "out" && <CornerUpLeft className="h-3 w-3 shrink-0 text-faint" aria-hidden />}
                            <span className="truncate">{m.body}</span>
                          </span>
                          {n > 0 && <span className="tabular shrink-0 rounded-full bg-brand px-1.5 text-[10.5px] font-semibold leading-[18px] text-brand-ink">{n}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            {!contact ? (
              <div className="grid flex-1 place-items-center"><EmptyState icon={MessageSquare} title="Select a conversation.">Choose a thread on the left to read it and reply here.</EmptyState></div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={personName(contact)} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">{label(contact)}</p>
                      <p className="truncate text-xs text-muted">{[contact.email, contact.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <Link href={`/contacts/${contact.id}`} className="btn btn-secondary btn-sm shrink-0"><ExternalLink aria-hidden />Open contact</Link>
                </div>
                <ScrollEnd className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-sunken px-5 py-5">
                  {(convo ?? []).map((m) => (
                    <div key={m.id} className={`flex max-w-[78%] flex-col gap-1 ${m.direction === "out" ? "items-end self-end" : "items-start self-start"}`}>
                      <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs ${m.direction === "out" ? "rounded-br-md bg-brand-soft text-ink" : "rounded-bl-md border border-line bg-surface text-ink"}`}>
                        {m.subject && <div className="mb-1 font-semibold">{m.subject}</div>}
                        {m.body}
                      </div>
                      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
                        <ChannelIcon channel={m.channel} size="sm" />
                        <span>{channelLabel(m.channel)}</span><span aria-hidden>·</span><span>{dateTime(m.created_at)}</span>
                        {m.status === "failed" && <><span aria-hidden>·</span><span className="font-semibold text-danger-ink">failed{m.error ? ` (${m.error})` : ""}</span></>}
                      </div>
                    </div>
                  ))}
                </ScrollEnd>
                <form action={sendMessage} className="flex flex-col gap-2.5 border-t border-line p-4">
                  <input type="hidden" name="contact_id" value={contact.id} />
                  <div className="flex gap-2">
                    <select name="channel" aria-label="Channel" defaultValue={active?.channel === "whatsapp" ? "whatsapp" : active?.channel === "email" ? "email" : "sms"} className="select !w-auto">
                      <option value="sms">SMS</option>
                      <option value="email">Email (Resend)</option>
                      {conn && <option value="outlook">Email (Outlook: {conn.account_email})</option>}
                      <option value="whatsapp">WhatsApp</option>
                      {contact.custom?.messenger_psid ? <option value="messenger">Facebook Messenger</option> : null}
                      {contact.custom?.instagram_id ? <option value="instagram">Instagram DM</option> : null}
                    </select>
                    <input name="subject" placeholder="Subject (email only)" aria-label="Subject (email only)" className="input flex-1" />
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea name="body" rows={2} placeholder="Write a reply" aria-label="Message" required className="textarea flex-1" />
                    <button data-toast="Message sent" className="btn btn-primary shrink-0"><Send aria-hidden />Send</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
