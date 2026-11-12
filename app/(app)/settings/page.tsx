import { getWorkspaces, currentRole } from "@/lib/workspace";
import { redirect } from "next/navigation";
import { createWorkspace, updateSettings } from "../../actions";
import { Building2, Mail, Palette, PhoneCall, Plug, Plus, Send } from "lucide-react";
import { Alert, Card, CardTitle, Field, Page, PageHeader, Section } from "@/components/ui";
import { CodeBlock } from "@/components/ui/copy-button";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { error, connected } = await searchParams;
  const { active } = await getWorkspaces();
  if (active) { const role = await currentRole(active.id); if (role !== "owner" && role !== "admin") redirect("/contacts?error=" + encodeURIComponent("That needs an admin. Ask the account owner.")); }
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://YOUR-APP";

  const sections = [["business", "Business"], ["messaging", "Messaging"], ["calls", "Calls"], ["branding", "Branding and email"], ["preview", "Email preview"], ["outlook", "Outlook mailbox"], ["tools", "Connect your tools"], ["snippet", "Website form snippet"], ["new", "Add a business"]];

  return (
    <Page>
      <PageHeader title="Settings" description={active ? <>Senders, branding and connections for {active.name}.</> : "Create your first business to get started."} />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid grid-cols-[190px_minmax(0,1fr)] items-start gap-10">
        <nav aria-label="Settings sections" className="sticky top-7 flex flex-col gap-px text-[13px]">
          {sections.filter(([id]) => active || id === "new").map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-lg px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-subtle hover:text-ink">{label}</a>)}
        </nav>

        <div className="flex min-w-0 max-w-3xl flex-col gap-10">
          {active && (
            <>
              <form action={updateSettings} className="flex flex-col gap-6">
                <Card>
                  <div id="business" className="scroll-mt-8"><CardTitle icon={Building2}>Business</CardTitle></div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Business name"><input name="name" defaultValue={active.name} className="input" /></Field>
                    <Field label="Alert email" hint="Internal notifications and failures go here."><input name="notify_email" defaultValue={active.notify_email ?? ""} placeholder="Alert email for internal notifications and failures, e.g. you@kydosdigital.com" className="input" /></Field>
                    <Field label="Booking link" hint="Used in follow-ups and no-show emails."><input name="booking_link" defaultValue={active.booking_link ?? ""} placeholder="Booking link (Cal.com) used in follow-ups and no-show emails" className="input" /></Field>
                    <Field label="Google review link" hint="Used in review requests."><input name="review_link" defaultValue={active.review_link ?? ""} placeholder="Google review link used in review requests" className="input" /></Field>
                    <Field label="Meta dataset (pixel) ID" hint="For the Conversions API. Optional."><input name="meta_dataset_id" defaultValue={active.meta_dataset_id ?? ""} placeholder="Meta dataset (pixel) ID for Conversions API, optional" className="input" /></Field>
                    <Field label="Postal address" hint="Shown in email footers. Required for compliance."><input name="business_address" defaultValue={active.business_address ?? ""} placeholder="Postal address for email footers (required for compliance)" className="input" /></Field>
                  </div>
                </Card>

                <Card>
                  <div id="messaging" className="scroll-mt-8"><CardTitle icon={Send}>Messaging</CardTitle></div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Email sender"><input name="email_from" defaultValue={active.email_from ?? ""} placeholder='Email sender, e.g. Kydos Digital <hello@kydosdigital.com>' className="input" /></Field>
                    <Field label="Reply-to address"><input name="reply_to" defaultValue={active.reply_to ?? ""} placeholder="Reply-to address for emails, e.g. hello@kydosdigital.com" className="input" /></Field>
                    <Field label="SMS sender" hint="+44 number, alphanumeric ID, or Messaging Service SID (MG...)."><input name="sms_from" defaultValue={active.sms_from ?? ""} placeholder="SMS sender: +44 number, alphanumeric ID, or Messaging Service SID (MG...)" className="input" /></Field>
                    <Field label="WhatsApp sender"><input name="whatsapp_from" defaultValue={active.whatsapp_from ?? ""} placeholder="WhatsApp sender, e.g. whatsapp:+447..." className="input" /></Field>
                  </div>
                </Card>

                <Card>
                  <div id="calls" className="scroll-mt-8"><CardTitle icon={PhoneCall}>Calls</CardTitle></div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Twilio voice number"><input name="call_number" defaultValue={active.call_number ?? ""} placeholder="Twilio voice number for calls, e.g. +447..." className="input" /></Field>
                    <Field label="Your mobile" hint="Incoming calls ring here first, missed ones get a WhatsApp."><input name="call_forward_number" defaultValue={active.call_forward_number ?? ""} placeholder="Your mobile: incoming calls ring here first, missed ones get a WhatsApp" className="input" /></Field>
                    <Field label="Missed-call WhatsApp template" hint={<>Approved template sent after a missed call. Uses {"{{1}}"} for the first name.</>}><input name="missed_call_template" defaultValue={active.missed_call_template ?? ""} placeholder="Approved WhatsApp template sent after a missed call (uses {{1}} = first name)" className="input" /></Field>
                    <Field label="Missed-call message" hint="Sent instead if the 24h WhatsApp window is open."><input name="missed_call_text" defaultValue={active.missed_call_text ?? ""} placeholder="Missed-call message if the 24h WhatsApp window is open" className="input" /></Field>
                  </div>
                </Card>

                <Card>
                  <div id="branding" className="scroll-mt-8"><CardTitle icon={Palette}>Branding and email</CardTitle></div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Brand colour" hint="Six-digit hex. Used on emails and proposals."><input name="brand_color" defaultValue={active.brand_color ?? "#0e5a48"} placeholder="Brand colour, e.g. #0e5a48" className="input !font-mono" /></Field>
                    <Field label="Website" hint="Shown in the email footer."><input name="website_url" defaultValue={active.website_url ?? ""} placeholder="Website, shown in the email footer" className="input" /></Field>
                    <Field label="Logo image link" className="col-span-2" hint="PNG or JPG, public https link, about 220px wide."><input name="logo_url" defaultValue={active.logo_url ?? ""} placeholder="Logo image link for emails (PNG or JPG, public https link, about 220px wide)" className="input" /></Field>
                    <Field label="Email signature" className="col-span-2" hint="Added under every email."><textarea name="email_signature" rows={3} defaultValue={active.email_signature ?? ""} placeholder="Email signature added under every email, e.g. Stephen Owojori, Director, Kydos Digital, 07..." className="textarea" /></Field>
                  </div>
                </Card>

                <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface/90 px-4 py-3 shadow-md backdrop-blur">
                  <span className="text-[13px] text-muted">Changes apply to {active.name} only.</span>
                  <button className="btn btn-primary">Save</button>
                </div>
              </form>

              <Section id="preview" title="Email preview" description={<>Every email from automations, bulk sends and invoices uses this branded layout. Save settings, then refresh to see changes. In email text you can use ## Heading, - bullets, **bold**, and buttons written as [button: Label | https://link].</>}>
                <iframe src="/api/email-preview" className="card h-[560px] w-full bg-white" title="Email preview" />
              </Section>

              <Section id="outlook" title="Outlook mailbox" description="Connect your Outlook mailbox so replies appear in the inbox and one-to-one emails send from your own address.">
                {connected === "outlook" && <Alert tone="success">Outlook connected.</Alert>}
                <a href="/api/auth/microsoft/start" className="btn btn-secondary"><Mail aria-hidden />Connect Outlook</a>
              </Section>

              <Section id="tools" title="Connect your tools" description="Point each service at these addresses.">
                <Card pad={false}>
                  <ul className="divide-y divide-line text-[13px] text-ink-2 [&>li]:flex [&>li]:items-start [&>li]:gap-3 [&>li]:px-5 [&>li]:py-3.5 [&>li>div]:min-w-0 [&>li>div]:leading-relaxed [&_svg]:mt-0.5 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-faint">
                    <li><Plug aria-hidden /><div>Twilio voice webhook (set on your call number, A call comes in, HTTP POST): <code>{url}/api/webhooks/twilio-voice</code></div></li>
                    <li><Plug aria-hidden /><div>Twilio inbound + status webhook: <code>{url}/api/webhooks/twilio</code></div></li>
                    <li><Plug aria-hidden /><div>Resend webhook: <code>{url}/api/webhooks/resend</code></div></li>
                    <li><Plug aria-hidden /><div>Cal.com webhook: <code>{url}/api/webhooks/calcom?ws={active.slug}</code> (events: booking created, cancelled; secret = CALCOM_WEBHOOK_SECRET)</div></li>
                    <li><Plug aria-hidden /><div>Other lead sources (Zapier, Make, Google Ads): POST JSON to <code>{url}/api/inbound</code> with header <code>Authorization: Bearer INBOUND_API_KEY</code></div></li>
                    <li><Plug aria-hidden /><div>Website form endpoint: POST JSON to <code>{url}/api/forms/contact-us</code> with <code>{`{"workspace":"${active.slug}","email":"..."}`}</code></div></li>
                  </ul>
                </Card>
              </Section>

              <Section id="snippet" title="Website form snippet" description="Paste this into any page on kydosdigital.com. Change the form name (contact-us) to trigger different automations.">
                <CodeBlock code={`<form id="kydos-form">
  <input name="first_name" placeholder="First name" required>
  <input name="email" type="email" placeholder="Email" required>
  <input name="phone" placeholder="Phone">
  <label><input type="checkbox" name="consent"> I agree to be contacted by email about my enquiry</label>
  <button>Send</button>
</form>
<script>
document.getElementById("kydos-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await fetch("${url}/api/forms/contact-us", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: "${active.slug}", first_name: f.get("first_name"), email: f.get("email"), phone: f.get("phone"), consent: f.get("consent") === "on" })
  });
  e.target.innerHTML = "Thanks, we will be in touch.";
});
</script>`} />
              </Section>
            </>
          )}

          <Section id="new" title="Add a business" description="Each business has its own contacts, pipeline, senders and branding.">
            <Card>
              <form action={createWorkspace} className="flex gap-2">
                <input name="name" placeholder="Business name" aria-label="Business name" required className="input flex-1" />
                <button className="btn btn-secondary"><Plus aria-hidden />Create</button>
              </form>
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}
