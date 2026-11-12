import { importContacts } from "../../../actions";
import { Upload } from "lucide-react";
import { Alert, Card, Field, Page, PageHeader } from "@/components/ui";

export default async function Import({ searchParams }: { searchParams: Promise<{ error?: string; done?: string; merged?: string; skipped?: string }> }) {
  const { error, done, merged, skipped } = await searchParams;
  return (
    <Page width="narrow">
      <PageHeader back={{ href: "/contacts", label: "Contacts" }} title="Import contacts (CSV)" description="Export contacts from GoHighLevel as CSV. Existing contacts are matched by email or phone and their tags are merged." />
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Imported {done} new, merged {merged} existing, skipped {skipped} without email or phone.</Alert>}
      <Card>
        <form action={importContacts} className="flex flex-col gap-4">
          <Field label="CSV file" hint={<>Recognised columns: First Name, Last Name (or Name), Email, Phone, Company Name, Tags.</>}>
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
          </Field>
          <Field label="Extra tag"><input name="extra_tag" placeholder="Extra tag for everyone in this file (optional)" className="input" /></Field>
          <Field label="Consent evidence" hint="Recorded on every imported contact."><input name="consent_note" placeholder="Consent evidence, e.g. Existing GHL contacts, opted in via enquiry form" className="input" /></Field>
          <button className="btn btn-primary self-start"><Upload aria-hidden />Import</button>
        </form>
      </Card>
    </Page>
  );
}
