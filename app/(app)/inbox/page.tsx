import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { CornerUpLeft, Inbox as InboxIcon } from "lucide-react";
import { Avatar, Badge, ChannelIcon, EmptyState, Page, PageHeader, personName } from "@/components/ui";

export default async function Inbox() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data } = await db
    .from("messages")
    .select("*, contacts(id,first_name,last_name,email,phone)")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(300);

  // Latest message per contact
  const seen = new Set<string>();
  const threads = (data ?? []).filter((m) => (seen.has(m.contact_id) ? false : (seen.add(m.contact_id), true)));

  const waiting = threads.filter((m) => m.direction === "in").length;

  return (
    <Page width="narrow">
      <PageHeader
        title="Inbox"
        meta={waiting > 0 ? <Badge tone="brand" dot>{waiting} awaiting reply</Badge> : undefined}
        description="The latest message from each contact across email, SMS, WhatsApp, Messenger and Instagram. Open a conversation to reply."
      />
      {threads.length === 0 && <div className="card"><EmptyState icon={InboxIcon} title="No messages yet.">Conversations appear here as soon as you send or receive a message.</EmptyState></div>}
      {threads.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {threads.map((m) => {
            const c = m.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null };
            const unread = m.direction === "in";
            return (
              <li key={m.id}>
                <Link href={`/contacts/${c.id}`} className="relative flex items-center gap-3.5 px-4 py-3.5 outline-offset-[-2px] transition-colors hover:bg-sunken">
                  {unread && <span aria-hidden className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-r-full bg-brand-text" />}
                  <Avatar name={personName(c)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`truncate text-[13.5px] text-ink ${unread ? "font-semibold" : "font-medium"}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</span>
                      <span className="tabular flex shrink-0 items-center gap-2 text-xs text-muted"><ChannelIcon channel={m.channel} size="sm" />{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1.5 truncate text-[13px] ${unread ? "text-ink-2" : "text-muted"}`}>
                      {m.direction === "out" && <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />}
                      <span className="truncate">{m.direction === "out" ? "You: " : ""}{m.body}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
