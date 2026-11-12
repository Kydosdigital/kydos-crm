import { requireAdmin } from "@/lib/workspace";
import { listWaTemplates } from "@/lib/whatsappTemplates";
import { removeWaTemplate, submitWaTemplate } from "../../actions";
import { MessageCircle, Plus } from "lucide-react";
import { Alert, Badge, Card, CardTitle, EmptyState, Field, Page, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/ui/copy-button";

export const dynamic = "force-dynamic";
const TONE = { APPROVED: "success", PENDING: "warning", REJECTED: "danger", PAUSED: "warning", DISABLED: "danger" } as const;

export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  await requireAdmin();
  const res = await listWaTemplates();
  return (
    <Page>
      <PageHeader title="WhatsApp templates" description="WhatsApp only lets you start a conversation with an approved template. Write one, send it to Meta for approval, then use it in campaigns and automations." />
      {msg && <Alert tone="success">{msg}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {!res.ok && <Alert tone="warning">{res.error}</Alert>}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <div className="flex flex-col gap-3">
          {res.ok && res.items.length === 0 && <div className="card"><EmptyState icon={MessageCircle} title="No templates yet">Create your first one on the right. Meta reviews it before it can be sent.</EmptyState></div>}
          {res.ok && res.items.map((t) => (
            <div key={t.id} className="card p-4 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2"><b className="font-mono text-[13px] font-semibold text-ink">{t.name}</b><Badge tone={TONE[t.status as keyof typeof TONE] ?? "neutral"} dot>{t.status.toLowerCase()}</Badge><Badge tone="outline">{t.category.toLowerCase()}</Badge><span className="text-xs text-muted">{t.language}</span></span>
                <span className="flex items-center gap-0.5">
                  {t.status === "APPROVED" && <CopyButton text={`send_whatsapp: ${t.name} | {{first_name}}`} label="Copy automation step" />}
                  <form action={removeWaTemplate}><input type="hidden" name="name" value={t.name} /><button className="btn btn-danger btn-sm">Delete</button></form>
                </span>
              </div>
              <p className="mt-2.5 whitespace-pre-wrap leading-relaxed text-ink-2">{t.body}</p>
              {t.footer && <p className="mt-1.5 text-xs text-muted">{t.footer}</p>}
              {t.reason && <p className="alert alert-danger mt-3 !py-2 !text-xs">Rejected: {t.reason.toLowerCase().replace(/_/g, " ")}</p>}
            </div>
          ))}
        </div>
        <Card>
          <CardTitle icon={Plus}>New template</CardTitle>
          <form action={submitWaTemplate} className="flex flex-col gap-3">
            <Field label="Name" hint="Lowercase letters, numbers and underscores."><input name="name" required placeholder="appointment_reminder" className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><select name="category" className="select"><option value="UTILITY">Utility (reminders, updates)</option><option value="MARKETING">Marketing (offers)</option></select></Field>
              <Field label="Language"><select name="language" className="select"><option value="en_GB">English (UK)</option><option value="en_US">English (US)</option></select></Field>
            </div>
            <Field label="Message" hint="Use {{1}}, {{2}} for personal details. In the CRM, variables fill in order, so {{1}} is usually the first name."><textarea name="body" required rows={5} placeholder="Hi {{1}}, a reminder that your appointment is on {{2}}. Reply here if you need to change it." className="textarea" /></Field>
            <Field label="Example values" hint="One per variable, comma separated. Meta uses these to review the template."><input name="examples" placeholder="Sam, Friday at 2pm" className="input" /></Field>
            <Field label="Footer (optional)"><input name="footer" placeholder="Kydos Digital" maxLength={60} className="input" /></Field>
            <button className="btn btn-primary">Submit to Meta</button>
          </form>
        </Card>
      </div>
    </Page>
  );
}
