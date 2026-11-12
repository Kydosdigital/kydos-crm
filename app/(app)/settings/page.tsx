import { getWorkspaces } from "@/lib/workspace";
import { createWorkspace, updateSettings } from "../../actions";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { error, connected } = await searchParams;
  const { active } = await getWorkspaces();
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://YOUR-APP";

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {active && (
        <>
          <h2 className="mb-2 font-semibold">{active.name}</h2>
          <form action={updateSettings} className="mb-8 flex flex-col gap-2">
            <input name="name" defaultValue={active.name} className="rounded border p-2" />
            <input name="email_from" defaultValue={active.email_from ?? ""} placeholder='Email sender, e.g. Kydos Digital <hello@kydosdigital.com>' className="rounded border p-2" />
            <input name="sms_from" defaultValue={active.sms_from ?? ""} placeholder="SMS sender: +44 number, alphanumeric ID, or Messaging Service SID (MG...)" className="rounded border p-2" />
            <input name="whatsapp_from" defaultValue={active.whatsapp_from ?? ""} placeholder="WhatsApp sender, e.g. whatsapp:+447..." className="rounded border p-2" />
            <input name="notify_email" defaultValue={active.notify_email ?? ""} placeholder="Alert email for internal notifications and failures, e.g. you@kydosdigital.com" className="rounded border p-2" />
            <input name="booking_link" defaultValue={active.booking_link ?? ""} placeholder="Booking link (Cal.com) used in follow-ups and no-show emails" className="rounded border p-2" />
            <input name="review_link" defaultValue={active.review_link ?? ""} placeholder="Google review link used in review requests" className="rounded border p-2" />
            <input name="business_address" defaultValue={active.business_address ?? ""} placeholder="Postal address for email footers (required for compliance)" className="rounded border p-2" />
            <button className="self-start rounded bg-black px-4 py-2 text-white">Save</button>
          </form>

          <h2 className="mb-1 font-semibold">Outlook mailbox</h2>
          {connected === "outlook" && <p className="mb-2 rounded bg-green-50 p-2 text-sm text-green-700">Outlook connected.</p>}
          <p className="mb-2 text-sm text-gray-700">Connect your Outlook mailbox so replies appear in the inbox and one-to-one emails send from your own address.</p>
          <a href="/api/auth/microsoft/start" className="mb-8 inline-block rounded border px-4 py-2 text-sm">Connect Outlook</a>

          <h2 className="mb-1 font-semibold">Connect your tools</h2>
          <ul className="mb-8 list-disc pl-5 text-sm text-gray-700">
            <li>Twilio inbound + status webhook: <code>{url}/api/webhooks/twilio</code></li>
            <li>Resend webhook: <code>{url}/api/webhooks/resend</code></li>
            <li>Cal.com webhook: <code>{url}/api/webhooks/calcom?ws={active.slug}</code> (events: booking created, cancelled; secret = CALCOM_WEBHOOK_SECRET)</li>
            <li>Other lead sources (Zapier, Make, Google Ads): POST JSON to <code>{url}/api/inbound</code> with header <code>Authorization: Bearer INBOUND_API_KEY</code></li>
            <li>Website form endpoint: POST JSON to <code>{url}/api/forms/contact-us</code> with <code>{`{"workspace":"${active.slug}","email":"..."}`}</code></li>
          </ul>
          <h2 className="mb-1 font-semibold">Website form snippet</h2>
          <p className="mb-1 text-sm text-gray-700">Paste this into any page on kydosdigital.com. Change the form name (contact-us) to trigger different automations.</p>
          <pre className="mb-8 overflow-x-auto rounded bg-gray-50 p-3 text-xs">{`<form id="kydos-form">
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
</script>`}</pre>
        </>
      )}

      <h2 className="mb-2 font-semibold">Add a business</h2>
      <form action={createWorkspace} className="flex gap-2">
        <input name="name" placeholder="Business name" required className="flex-1 rounded border p-2" />
        <button className="rounded border px-4">Create</button>
      </form>
    </div>
  );
}
