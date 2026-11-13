import Link from "next/link";
import { AlertCircle, CalendarDays, CheckSquare, Clock3, MessageCircle, PhoneMissed, UserRoundPlus } from "lucide-react";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { Alert, Card, Page, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

function londonMidnight(addDays = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + addDays));
  const utc = new Date(date.toISOString().slice(0, 10) + "T00:00:00Z");
  const londonTime = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utcTime = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (londonTime.getTime() - utcTime.getTime())).toISOString();
}

const localTime = (value: string) => new Date(value).toLocaleString("en-GB", {
  timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

export default async function MorningActions() {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const todayStart = londonMidnight();
  const tomorrowStart = londonMidnight(1);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();

  const [leadResult, outgoingResult, taskResult, missedResult, bookingResult, postResult, invoiceResult] =
    await Promise.all([
      db.from("contacts").select("id,first_name,last_name,email,created_at", { count: "exact" })
        .eq("workspace_id", ws.id).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(200),
      db.from("messages").select("contact_id,created_at", { count: "exact" })
        .eq("workspace_id", ws.id).eq("direction", "out")
        .neq("status", "queued").neq("status", "failed")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
      db.from("tasks").select("id,title,due_at", { count: "exact" })
        .eq("workspace_id", ws.id).eq("done", false)
        .lt("due_at", tomorrowStart).order("due_at").limit(200),
      db.from("call_logs").select("id,from_number,status,created_at", { count: "exact" })
        .eq("workspace_id", ws.id).eq("direction", "in")
        .in("status", ["no-answer", "no_answer", "missed", "busy", "failed"])
        .gte("created_at", since).order("created_at", { ascending: false }).limit(200),
      db.from("bookings").select("id,start_time,status", { count: "exact" })
        .eq("workspace_id", ws.id).neq("status", "cancelled")
        .gte("start_time", todayStart).lt("start_time", tomorrowStart)
        .order("start_time").limit(200),
      db.from("content_posts").select("id,client,platform,scheduled_at,status", { count: "exact" })
        .eq("workspace_id", ws.id)
        .in("status", ["awaiting_approval", "changes_requested"])
        .order("scheduled_at").limit(200),
      db.from("invoices").select("id,number,amount_gbp,due_date", { count: "exact" })
        .eq("workspace_id", ws.id).eq("kind", "invoice").eq("status", "sent")
        .order("due_date", { ascending: true, nullsFirst: false }).limit(200),
    ]);

  const errors = [leadResult, outgoingResult, taskResult, missedResult, bookingResult, postResult, invoiceResult]
    .some((result) => !!result.error);
  const capped = (leadResult.count ?? 0) > 200 || (outgoingResult.count ?? 0) > 2000 ||
    (taskResult.count ?? 0) > 200 || (missedResult.count ?? 0) > 200 ||
    (bookingResult.count ?? 0) > 200 || (postResult.count ?? 0) > 200 || (invoiceResult.count ?? 0) > 200;
  // Count a contact as contacted if an outgoing message was sent or accepted,
  // including automated replies. Queued and failed messages do not count.
  const contacted = new Set((outgoingResult.data ?? []).map((m) => m.contact_id));
  const unanswered = (leadResult.data ?? []).filter((c) => !contacted.has(c.id));
  const tasks = taskResult.data ?? [];
  const overdue = tasks.filter((t) => t.due_at && t.due_at < todayStart).length;
  const todayTasks = tasks.filter((t) => t.due_at && t.due_at >= todayStart).length;
  const pendingPosts = postResult.data ?? [];
  const outstanding = invoiceResult.data ?? [];
  const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = (result: { count: number | null; error: unknown }) => result.error ? "Unavailable" : String(result.count ?? 0);
  const leadCount = leadResult.error || outgoingResult.error || (leadResult.count ?? 0) > 200 || (outgoingResult.count ?? 0) > 2000
    ? "Check list" : String(unanswered.length);

  return (
    <Page>
      <PageHeader title="Morning actions"
        description={"What needs attention in " + ws.name + ". Today uses Europe/London dates. Leads and missed calls cover the last seven days."}
        actions={<Link href="/reports" className="btn btn-secondary">Open reports</Link>} />
      {errors && <Alert tone="danger">One or more data sources could not be read. Figures marked unavailable must not be treated as zero.</Alert>}
      {capped && <Alert tone="warning">Some data sources exceed the display limit. Lists may be incomplete. Open the relevant module to review all records.</Alert>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Leads without an outgoing message (7d)" value={leadCount} icon={UserRoundPlus} tone={unanswered.length ? "warning" : "brand"} />
        <Stat label="Open tasks due today" value={taskResult.error ? "Unavailable" : String(todayTasks)} icon={CheckSquare} />
        <Stat label="Overdue tasks" value={taskResult.error ? "Unavailable" : String(overdue)} icon={Clock3} tone={overdue ? "warning" : "brand"} />
        <Stat label="Missed inbound calls (7d)" value={count(missedResult)} icon={PhoneMissed} tone={(missedResult.count ?? 0) > 0 ? "warning" : "brand"} />
        <Stat label="Appointments today" value={count(bookingResult)} icon={CalendarDays} />
        <Stat label="Posts awaiting action" value={count(postResult)} icon={MessageCircle} tone={pendingPosts.length ? "warning" : "brand"} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">New leads to contact</h2>
            <Link href="/contacts" className="link text-xs">Contacts</Link>
          </div>
          <p className="mb-3 text-xs text-muted">New contacts without a non-failed outgoing message in the last seven days. Automated messages also count as contacted.</p>
          {unanswered.slice(0, 8).map((c) => (
            <Link key={c.id} href={"/contacts/" + c.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
              <span className="font-medium text-ink">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed contact"}</span>
              <span className="text-xs text-muted">{localTime(c.created_at)}</span>
            </Link>
          ))}
          {!unanswered.length && <p className="text-[13px] text-muted">No unanswered leads found in the checked period.</p>}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Tasks to prioritise</h2>
            <Link href="/tasks" className="link text-xs">Tasks</Link>
          </div>
          {tasks.slice(0, 8).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
              <span className="font-medium text-ink">{t.title}</span>
              <span className={"shrink-0 text-xs " + (t.due_at && t.due_at < todayStart ? "text-danger-ink" : "text-muted")}>
                {t.due_at ? localTime(t.due_at) : "No date"}
              </span>
            </div>
          ))}
          {!tasks.length && <p className="text-[13px] text-muted">No tasks are due today or overdue.</p>}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Content awaiting action</h2>
            <Link href="/calendar" className="link text-xs">Content calendar</Link>
          </div>
          {pendingPosts.slice(0, 8).map((p) => (
            <div key={p.id} className="border-b border-line py-2 text-[13px] last:border-0">
              <span className="font-medium text-ink">{p.client}</span>
              <span className="ml-2 text-xs text-muted">{p.platform}, {p.status === "changes_requested" ? "changes requested" : "awaiting approval"}</span>
            </div>
          ))}
          {!pendingPosts.length && <p className="text-[13px] text-muted">No posts awaiting approval or revision.</p>}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Sent invoices awaiting payment</h2>
            <Link href="/invoices" className="link text-xs">Invoices</Link>
          </div>
          <p className="mb-3 text-xs text-muted">{count(invoiceResult)} sent invoice(s). Only the first eight matching records are shown.</p>
          {outstanding.slice(0, 8).map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
              <span className="font-medium text-ink">{invoice.number}</span>
              <span className="text-muted">{gbp(Number(invoice.amount_gbp))}</span>
            </div>
          ))}
          {!outstanding.length && <p className="text-[13px] text-muted">No sent invoices awaiting payment.</p>}
        </Card>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
        <AlertCircle className="h-4 w-4" aria-hidden />
        This snapshot does not replace reports. CRM message records do not guarantee provider delivery.
      </div>
    </Page>
  );
}
