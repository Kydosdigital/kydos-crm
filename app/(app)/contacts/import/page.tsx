import { importContacts } from "../../../actions";

export default async function Import({ searchParams }: { searchParams: Promise<{ error?: string; done?: string; merged?: string; skipped?: string }> }) {
  const { error, done, merged, skipped } = await searchParams;
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Import contacts (CSV)</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {done && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Imported {done} new, merged {merged} existing, skipped {skipped} without email or phone.</p>}
      <p className="mb-3 text-sm text-gray-700">Export contacts from GoHighLevel as CSV. Recognised columns: First Name, Last Name (or Name), Email, Phone, Company Name, Tags. Existing contacts are matched by email or phone and their tags are merged.</p>
      <form action={importContacts} className="flex flex-col gap-2">
        <input type="file" name="file" accept=".csv,text/csv" required className="rounded border p-2" />
        <input name="extra_tag" placeholder="Extra tag for everyone in this file (optional)" className="rounded border p-2" />
        <input name="consent_note" placeholder="Consent evidence, e.g. Existing GHL contacts, opted in via enquiry form" className="rounded border p-2" />
        <button className="self-start rounded bg-black px-4 py-2 text-white">Import</button>
      </form>
    </div>
  );
}
