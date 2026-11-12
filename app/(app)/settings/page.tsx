import { getWorkspaces } from "@/lib/workspace";
import { createWorkspace, updateSettings } from "../../actions";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
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
            <input name="business_address" defaultValue={active.business_address ?? ""} placeholder="Postal address for email footers (required for compliance)" className="rounded border p-2" />
            <button className="self-start rounded bg-black px-4 py-2 text-white">Save</button>
          </form>

          <h2 className="mb-1 font-semibold">Connect your tools</h2>
          <ul className="mb-8 list-disc pl-5 text-sm text-gray-700">
            <li>Twilio inbound + status webhook: <code>{url}/api/webhooks/twilio</code></li>
            <li>Resend webhook: <code>{url}/api/webhooks/resend</code></li>
            <li>Website form endpoint: POST JSON to <code>{url}/api/forms/contact-us</code> with <code>{`{"workspace":"${active.slug}","email":"..."}`}</code></li>
          </ul>
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
